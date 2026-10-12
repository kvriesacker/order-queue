import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { Order } from '../models';
import { OrderCard } from './order-card';
import { CounterPizzas, partlyCalled, waitingAtCounter } from './counter-pizzas';
import { Eta } from './eta';
import { T } from '../i18n/i18n';
import { focusMode } from '../focus';
import { FocusToggle } from './focus-toggle';

@Component({
  selector: 'app-counter',
  imports: [OrderCard, CounterPizzas, RouterLink, Eta, FocusToggle, T],
  template: `
    <main class="page" [class.focus]="focus()">
      <div class="toolbar">
        @if (!focus()) {
          <a class="btn primary big" routerLink="../display">{{ 'Show customer screen' | t }}</a>
          <a class="btn" [href]="displayLink()" target="_blank" rel="noopener">{{ 'Open in new window' | t }}</a>
        }
        <app-focus-toggle />
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
            <app-order-card [order]="order" [showItems]="false">
              <app-counter-pizzas pizzas [order]="order" mode="kitchen" />
              @if (order.status === 'ready') {
                @if (!partly(order)) {
                  <button
                    class="btn ghost"
                    type="button"
                    (click)="queue.setStatus(order, 'in-progress')"
                  >
                    {{ 'Undo' | t }}
                  </button>
                }
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
              <app-counter-pizzas pizzas [order]="order" mode="screen" />
              @if (order.status === 'ready-for-customer') {
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
              }
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
  protected focus = focusMode;
  /**
   * Orders with baked pizzas not on the customer screen yet. A big order shown in part is
   * here with its other pizzas and under On the customer screen with the shown ones.
   */
  protected baked = computed(() => this.queue.orders().filter(waitingAtCounter));
  protected called = computed(() =>
    this.queue.orders().filter((o) => o.status === 'ready-for-customer' || partlyCalled(o)),
  );
  protected making = computed(() =>
    this.queue.orders().filter((o) => isMaking(o) && !someBaked(o) && !partlyCalled(o)),
  );
  protected partly = partlyCalled;
  protected displayLink = computed(() => this.queue.shareLink(this.queue.state()?.id) + '/display');
}

function isMaking(o: Order): boolean {
  return o.status === 'new' || o.status === 'in-progress';
}

function someBaked(o: Order): boolean {
  return o.items.some((i) => i.units.includes('baked'));
}
