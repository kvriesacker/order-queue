import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { renderSVG } from 'uqr';
import { OrderDraft, QueueService } from '../queue.service';
import { formatPrice, orderTotal, priceOf } from '../models';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';
import { T, speakToCustomers, t } from '../i18n/i18n';

/** How long the last order stays on the screen when no new one comes in. */
const SHOW_FOR = 10 * 60000;
/** Drafts older than this are left over from an earlier session. */
const DRAFT_MAX_AGE = 60 * 60000;
/** From this many left (or fewer), a pizza or the total shows as almost sold out. */
export const ALMOST_GONE = 5;

/**
 * Screen facing the customer where they order. While the order is taken it shows what's in
 * it, with a QR code to follow it on their phone. Once sent, it shows the order number and
 * estimated time, still with the QR code unless the order taker hides it. In between it says
 * "Next customer". While waiting and ordering, the pizzas are listed with the ones (or the
 * total) almost sold out marked, so customers know before they ask. Made for full screen.
 */
import { Unlock } from './unlock';
import { SponsorBanner } from './sponsor-banner';
@Component({
  selector: 'app-order-screen',
  imports: [Unlock, T, SponsorBanner],
  template: `
    @if (queue.lock() !== 'open') {
      <app-unlock />
    } @else {
    <main class="order-screen" (dblclick)="fullscreen()">
      <p class="os-shop">{{ queue.state()?.name }}</p>
      @if (building(); as b) {
        <div class="os-body">
          <section class="os-order">
            <p class="os-label">{{ 'Your order' | t }}</p>
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
              <p class="os-total"><span>{{ 'Total' | t }}</span> <strong>{{ price(b.total) }}</strong></p>
            }
          </section>
          <section class="os-qr">
            <div class="qr" [innerHTML]="b.qr.svg" [attr.data-link]="b.qr.link"></div>
            <p class="os-scan">{{ 'Scan me to follow your order' | t }}</p>
          </section>
        </div>
      } @else if (current(); as c) {
        <div class="os-body" [class.no-qr]="!c.qr">
          <section class="os-order">
            @if (c.order; as order) {
              <p class="os-label">{{ 'Your order number' | t }}</p>
              <p class="os-number">{{ order.number }}</p>
              @if (order.customer) {
                <p class="os-name">{{ order.customer }}</p>
              }
              <p class="os-pizzas">{{ c.pizzas }}</p>
              @if (c.total) {
                <p class="os-pizzas os-paid">{{ 'Total' | t }} <strong>{{ price(c.total) }}</strong></p>
              }
              @if (c.eta) {
                <p class="os-eta">
                  @let ready = around();
                  {{ ready[0] }}<strong>{{ clock(c.eta) }}</strong>{{ ready[1] }}&nbsp;<span>({{ until(c.eta) }})</span>
                </p>
              }
            } @else {
              <p class="os-welcome">{{ 'Thank you!' | t }}</p>
              <p class="muted">{{ 'Your order is on its way to the kitchen.' | t }}</p>
            }
          </section>
          @if (c.qr) {
            <section class="os-qr">
              <div class="qr" [innerHTML]="c.qr.svg" [attr.data-link]="c.qr.link"></div>
              <p class="os-scan">{{ 'Scan me to follow your order' | t }}</p>
            </section>
          }
        </div>
      } @else {
        <div class="os-idle">
          @if (queue.pizzasLeft() === 0) {
            <p class="os-welcome">{{ 'Sold out' | t }}</p>
            <p class="muted">{{ 'Sorry, all pizzas are sold. Thanks for coming!' | t }}</p>
          } @else {
            <p class="os-welcome">{{ 'Next customer' | t }}</p>
            <p class="muted">{{ "Your order shows here while it's taken." | t }}</p>
          }
        </div>
      }
      @if (menu(); as m) {
        <section class="os-menu" [attr.aria-label]="'Our pizzas' | t">
          @if (m.total !== null && m.total <= almostGone) {
            <p class="os-total-left" [class.gone]="m.total === 0">
              @if (m.total === 0) {
                {{ 'These are the last pizzas for today' | t }}
              } @else {
                @let only = totalLeft(m.total, m.inOrder);
                {{ only[0] }}<strong>{{ m.total }}</strong>{{ only[1] }}
              }
            </p>
          }
          <ul>
            @for (item of m.items; track item.name) {
              <li [style.border-left-color]="item.color" [class.gone]="item.left === 0">
                <span class="os-menu-name">{{ item.name }}</span>
                @if (item.price) {
                  <span class="os-menu-price">{{ price(item.price) }}</span>
                }
                @if (item.left === 0) {
                  <small class="os-left gone">{{ 'Sold out' | t }}</small>
                } @else if (item.left !== null && item.left <= almostGone) {
                  <small class="os-left">{{ 'Only {n} left' | t: { n: item.left } }}</small>
                }
              </li>
            }
          </ul>
        </section>
      }
      <app-sponsor-banner class="os-sponsor" />
      <footer class="os-footer">
        @if (queue.connection() === 'offline' || queue.connection() === 'no-backend') {
          <span class="pill offline">{{ 'Offline' | t }}</span>
        }
        <!-- Customers stand at this screen: nothing to tap once it's full screen, no way back
             to the staff pages. Staff leave full screen with Esc and close the window. -->
        @if (!isFullscreen()) {
          <button type="button" (click)="fullscreen()">{{ 'Full screen' | t }}</button>
        }
      </footer>
    </main>
    }
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

  /**
   * The pizzas on sale with how many are left, when that's few, and the total left. While an
   * order is taken it counts that order too, so "Only 2 left" means 2 more can be added.
   * Hidden once an order is sent and when everything is sold out (the screen says so).
   */
  protected menu = computed(() => {
    const state = this.queue.state();
    if (!state || this.queue.pizzasLeft() === 0) return null;
    const building = this.building();
    if (!building && this.current()) return null;
    const inOrder = building ? (this.draft()?.pizzas ?? []) : [];
    const totalLeft = this.queue.pizzasLeft();
    const total = totalLeft === null ? null : Math.max(0, totalLeft - inOrder.length);
    const items = state.menu
      .filter((m) => m.enabled)
      .map((m) => {
        const n = this.queue.typeLeft().get(m.name) ?? null;
        const mine = inOrder.filter((p) => p.name === m.name).length;
        return {
          name: m.name,
          color: m.color,
          price: priceOf(state, m.name),
          left: n === null ? (total === 0 ? 0 : null) : total === 0 ? 0 : Math.max(0, n - mine),
        };
      });
    return items.length ? { items, total, inOrder: inOrder.length > 0 } : null;
  });
  protected almostGone = ALMOST_GONE;

  /**
   * The QR code for the customer's follow page, with its link. It's our own SVG made from our
   * own link, so it's safe to insert.
   */
  private qr(orderId: string) {
    const link = this.queue.trackLink(orderId);
    return { link, svg: this.sanitizer.bypassSecurityTrustHtml(renderSVG(link, { border: 2 })) };
  }

  constructor() {
    const onChange = () => this.isFullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('fullscreenchange', onChange));
    // Customers read this screen: it speaks the queue's language.
    speakToCustomers(() => this.queue.state()?.lang);
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
  }

  /** "Ready around " and "" around the (bold) time, in the current language. */
  protected around(): [string, string] {
    return around(t('Ready around {time}'), '{time}');
  }

  /** The texts before and after the (bold) number of pizzas left, in the current language. */
  protected totalLeft(n: number, inOrder: boolean): [string, string] {
    const text = inOrder
      ? n === 1
        ? t('Only {n} pizza left after this order')
        : t('Only {n} pizzas left after this order')
      : n === 1
        ? t('Only {n} pizza left')
        : t('Only {n} pizzas left');
    return around(text, '{n}');
  }

  protected isFullscreen = signal(!!document.fullscreenElement);

  /** Only into full screen: a customer tapping twice mustn't take it out. */
  fullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

/** A translated sentence split around its placeholder, so the value can be shown in bold. */
function around(text: string, placeholder: string): [string, string] {
  const i = text.indexOf(placeholder);
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + placeholder.length)];
}
