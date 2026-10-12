import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { Order } from '../models';
import { OrderCard } from './order-card';
import { CounterPizzas } from './counter-pizzas';
import { Eta } from './eta';
import { T } from '../i18n/i18n';

@Component({
  selector: 'app-counter',
  imports: [OrderCard, CounterPizzas, RouterLink, Eta, T],
  template: `
    <main class="page">
      <div class="toolbar">
        <a class="btn primary big" routerLink="../display">{{ 'Show customer screen' | t }}</a>
        <a class="btn" [href]="displayLink()" target="_blank" rel="noopener">{{ 'Open in new window' | t }}</a>
      </div>
      <div class="board counter-board">
        <section class="column making-col">
          <h2>{{ 'Still being made' | t }}</h2>
          @for (order of making(); track order.id) {
            <div class="mini">
              <strong>#{{ order.number }}</strong>
              <app-eta [orderId]="order.id" [compact]="true" />
            </div>
          } @empty {
            <p class="muted">{{ 'None.' | t }}</p>
          }
        </section>
        <section class="column">
          <h2>
            {{ 'From the kitchen' | t }} <span class="count">{{ baked().length }}</span>
          </h2>
          @for (order of baked(); track order.id) {
            <app-order-card [order]="order" [showItems]="false" [class.partly-baked]="order.status !== 'ready'">
              <app-counter-pizzas pizzas [order]="order" />
              @if (order.status === 'ready') {
                <button
                  class="btn ghost"
                  type="button"
                  (click)="queue.setStatus(order, 'in-progress')"
                >
                  {{ 'Undo' | t }}
                </button>
                <button
                  class="btn success"
                  type="button"
                  (click)="queue.setStatus(order, 'ready-for-customer')"
                >
                  {{ 'Ready for customer' | t }}
                </button>
              }
            </app-order-card>
          } @empty {
            <p class="muted">{{ 'Nothing baked yet.' | t }}</p>
          }
        </section>
        <section class="column">
          <h2>
            {{ 'On the customer screen' | t }} <span class="count">{{ called().length }}</span>
          </h2>
          @for (order of called(); track order.id) {
            <app-order-card [order]="order" [showItems]="false">
              <app-counter-pizzas pizzas [order]="order" />
              <button class="btn ghost" type="button" (click)="queue.setStatus(order, 'ready')">
                {{ 'Undo' | t }}
              </button>
              <button
                class="btn primary"
                type="button"
                (click)="queue.setStatus(order, 'collected')"
              >
                {{ 'Picked up' | t }}
              </button>
            </app-order-card>
          } @empty {
            <p class="muted">{{ 'No orders waiting for pickup.' | t }}</p>
          }
        </section>
      </div>
    </main>
  `,
})
export class Counter {
  protected queue = inject(QueueService);
  /** Baked orders, and orders still being made once one of their pizzas is baked. */
  protected baked = computed(() =>
    this.queue.orders().filter((o) => o.status === 'ready' || (isMaking(o) && someBaked(o))),
  );
  protected called = computed(() =>
    this.queue.orders().filter((o) => o.status === 'ready-for-customer'),
  );
  protected making = computed(() => this.queue.orders().filter((o) => isMaking(o) && !someBaked(o)));
  protected displayLink = computed(() => this.queue.shareLink(this.queue.state()?.id) + '/display');
}

function isMaking(o: Order): boolean {
  return o.status === 'new' || o.status === 'in-progress';
}

function someBaked(o: Order): boolean {
  return o.items.some((i) => i.units.includes('baked'));
}
