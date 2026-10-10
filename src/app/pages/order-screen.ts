import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { renderSVG } from 'uqr';
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';

/** How long the last order stays on the screen when no new one comes in. */
const SHOW_FOR = 10 * 60000;

/**
 * Screen facing the customer where they order: shows the order just placed with its
 * estimated time and a QR code to follow it on their phone. No menu, made for full screen.
 */
@Component({
  selector: 'app-order-screen',
  imports: [RouterLink],
  template: `
    <main class="order-screen" (dblclick)="fullscreen()">
      <p class="os-shop">{{ queue.state()?.name }}</p>
      @if (current(); as c) {
        <div class="os-body">
          <section class="os-order">
            <p class="os-label">Your order number</p>
            <p class="os-number">{{ c.order.number }}</p>
            @if (c.order.customer) {
              <p class="os-name">{{ c.order.customer }}</p>
            }
            <p class="os-pizzas">{{ c.pizzas }}</p>
            @if (c.eta) {
              <p class="os-eta">
                Ready around <strong>{{ clock(c.eta) }}</strong>&nbsp;<span>({{ until(c.eta) }})</span>
              </p>
            }
          </section>
          <section class="os-qr">
            <div class="qr" [innerHTML]="c.qr"></div>
            <p>Scan to follow your order<br />and its ready time on your phone</p>
          </section>
        </div>
      } @else {
        <div class="os-idle">
          @if (queue.pizzasLeft() === 0) {
            <p class="os-welcome">Sold out</p>
            <p class="muted">Sorry, all pizzas are sold. Thanks for coming!</p>
          } @else {
            <p class="os-welcome">Welcome!</p>
            <p class="muted">Your order number and a code to follow it appear here.</p>
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
  protected until = (t: number) => minutesUntil(t, this.queue.now());

  /** The newest order, while it's recent and still waiting. */
  protected current = computed(() => {
    const order = this.queue
      .orders()
      .reduce<
        ReturnType<QueueService['orders']>[number] | null
      >((a, o) => (!a || o.createdAt > a.createdAt ? o : a), null);
    if (!order || this.queue.now() - order.createdAt > SHOW_FOR) return null;
    if (order.status === 'collected' || order.status === 'cancelled') return null;
    // The QR code is our own SVG made from our own link, so it's safe to insert.
    const svg = renderSVG(this.queue.trackLink(order.id), { border: 2 });
    return {
      order,
      pizzas: pizzaSummary(order),
      eta: this.queue.estimates().get(order.id),
      qr: this.sanitizer.bypassSecurityTrustHtml(svg),
    };
  });

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
