import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { renderSVG } from 'uqr';
import { OrderDraft, QueueService } from '../queue.service';
import { formatPrice, orderTotal } from '../models';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';

/** How long the last order stays on the screen when no new one comes in. */
const SHOW_FOR = 10 * 60000;
/** Drafts older than this are left over from an earlier session. */
const DRAFT_MAX_AGE = 60 * 60000;

/**
 * Screen facing the customer where they order. While the order is taken it shows what's in
 * it, with a QR code to follow it on their phone. Once sent, it shows the order number and
 * estimated time (the QR code again only when the order taker asks). In between it says
 * "Next customer". No menu, made for full screen.
 */
@Component({
  selector: 'app-order-screen',
  imports: [RouterLink],
  template: `
    <main class="order-screen" (dblclick)="fullscreen()">
      <p class="os-shop">{{ queue.state()?.name }}</p>
      @if (building(); as b) {
        <div class="os-body">
          <section class="os-order">
            <p class="os-label">Your order</p>
            @if (b.customer) {
              <p class="os-name">{{ b.customer }}</p>
            }
            <ul class="os-lines">
              @for (line of b.lines; track line.name) {
                <li [style.border-left-color]="line.color">
                  <span><strong>{{ line.count }}×</strong> {{ line.name }}</span>
                  @if (b.total) {
                    <span class="os-calc">{{ line.count }} × {{ price(line.price) }}</span>
                    <span class="os-sub">{{ price(line.subtotal) }}</span>
                  }
                </li>
              }
            </ul>
            @if (b.total) {
              <p class="os-total"><span>Total</span> <strong>{{ price(b.total) }}</strong></p>
            }
          </section>
          <section class="os-qr">
            <div class="qr" [innerHTML]="b.qr"></div>
            <p class="os-scan">Scan me to follow your order</p>
          </section>
        </div>
      } @else if (current(); as c) {
        <div class="os-body" [class.no-qr]="!c.qr">
          <section class="os-order">
            @if (c.order; as order) {
              <p class="os-label">Your order number</p>
              <p class="os-number">{{ order.number }}</p>
              @if (order.customer) {
                <p class="os-name">{{ order.customer }}</p>
              }
              <p class="os-pizzas">{{ c.pizzas }}</p>
              @if (c.total) {
                <p class="os-pizzas os-paid">Total <strong>{{ price(c.total) }}</strong></p>
              }
              @if (c.eta) {
                <p class="os-eta">
                  Ready around <strong>{{ clock(c.eta) }}</strong>&nbsp;<span>({{ until(c.eta) }})</span>
                </p>
              }
            } @else {
              <p class="os-welcome">Thank you!</p>
              <p class="muted">Your order is on its way to the kitchen.</p>
            }
          </section>
          @if (c.qr) {
            <section class="os-qr">
              <div class="qr" [innerHTML]="c.qr"></div>
              <p class="os-scan">Scan me to follow your order</p>
            </section>
          }
        </div>
      } @else {
        <div class="os-idle">
          @if (queue.pizzasLeft() === 0) {
            <p class="os-welcome">Sold out</p>
            <p class="muted">Sorry, all pizzas are sold. Thanks for coming!</p>
          } @else {
            <p class="os-welcome">Next customer</p>
            <p class="muted">Your order shows here while it's taken.</p>
          }
        </div>
      }
      <footer class="os-footer">
        @if (queue.connection() !== 'online') {
          <span class="pill offline">Offline</span>
        }
        <button type="button" (click)="fullscreen()">Full screen</button>
        <a routerLink="../take">Back</a>
      </footer>
    </main>
  `,
})
export class OrderScreen {
  protected queue = inject(QueueService);
  private sanitizer = inject(DomSanitizer);
  readonly id = input.required<string>();
  protected clock = clockTime;
  protected price = formatPrice;
  protected until = (t: number) => minutesUntil(t, this.queue.now());

  /** Which order point to follow (from the link on the Orders tab); any when missing. */
  readonly pos = input<string>();

  /** The latest draft of the order point this screen follows. */
  private draft = computed<OrderDraft | null>(() => {
    const pos = this.pos();
    const drafts = [...this.queue.drafts().values()].filter(
      (d) => (!pos || d.pos === pos) && this.queue.now() - d.at < DRAFT_MAX_AGE,
    );
    return drafts.reduce<OrderDraft | null>((a, d) => (!a || d.at > a.at ? d : a), null);
  });

  /** The order being taken right now, with the QR code it will have. */
  protected building = computed(() => {
    const draft = this.draft();
    if (!draft?.pizzas.length) return null;
    const lines = new Map<
      string,
      { name: string; color: string; count: number; price: number; subtotal: number }
    >();
    for (const p of draft.pizzas) {
      const line = lines.get(p.name) ?? { name: p.name, color: p.color, count: 0, price: p.price ?? 0, subtotal: 0 };
      line.count++;
      line.subtotal = Math.round(line.count * line.price * 100) / 100;
      lines.set(p.name, line);
    }
    const all = [...lines.values()];
    const total = Math.round(all.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;
    return { customer: draft.customer, lines: all, total, qr: this.qr(draft.orderId) };
  });

  /**
   * The order just sent, while it's recent and still waiting. Without an order point (an old
   * link), the newest order.
   */
  protected current = computed(() => {
    const draft = this.draft();
    const orders = this.queue.orders();
    const order = draft
      ? orders.find((o) => o.id === draft.sentId)
      : orders.reduce<(typeof orders)[number] | null>(
          (a, o) => (!a || o.createdAt > a.createdAt ? o : a),
          null,
        );
    const qr = draft?.showQr && draft.sentId ? this.qr(draft.sentId) : null;
    if (!order) {
      // Sent but not confirmed by the host yet.
      return draft?.sentId && this.queue.now() - draft.at < SHOW_FOR ? { order: null, qr } : null;
    }
    if (this.queue.now() - order.createdAt > SHOW_FOR && !draft?.showQr) return null;
    if (order.status === 'collected' || order.status === 'cancelled') return null;
    return {
      order,
      pizzas: pizzaSummary(order),
      total: orderTotal(order),
      eta: this.queue.estimates().get(order.id),
      qr,
    };
  });

  /** The QR code is our own SVG made from our own link, so it's safe to insert. */
  private qr(orderId: string) {
    const svg = renderSVG(this.queue.trackLink(orderId), { border: 2 });
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
  }

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
}
