import { Component, computed, inject } from '@angular/core';
import { QueueService } from '../queue.service';
import { OrderCard } from './order-card';

@Component({
  selector: 'app-kitchen',
  imports: [OrderCard],
  template: `
    <main class="page board">
      <section class="column">
        <h2>
          New <span class="count">{{ waiting().length }}</span>
        </h2>
        @for (order of waiting(); track order.id) {
          <app-order-card [order]="order">
            <button
              class="btn primary"
              type="button"
              (click)="queue.setStatus(order, 'in-progress')"
            >
              Start · in the oven
            </button>
          </app-order-card>
        } @empty {
          <p class="muted">No new orders.</p>
        }
      </section>
      <section class="column">
        <h2>
          In the oven <span class="count">{{ baking().length }}</span>
        </h2>
        @for (order of baking(); track order.id) {
          <app-order-card [order]="order">
            <button class="btn ghost" type="button" (click)="queue.setStatus(order, 'new')">
              Undo
            </button>
            <button class="btn success" type="button" (click)="queue.setStatus(order, 'ready')">
              Ready
            </button>
          </app-order-card>
        } @empty {
          <p class="muted">Nothing in the oven.</p>
        }
      </section>
      <section class="column narrow">
        <h2>
          Baked, waiting at counter <span class="count">{{ baked().length }}</span>
        </h2>
        @for (order of baked(); track order.id) {
          <div class="mini">
            <strong>#{{ order.number }}</strong>
            <button
              class="btn ghost small"
              type="button"
              (click)="queue.setStatus(order, 'in-progress')"
            >
              Undo
            </button>
          </div>
        } @empty {
          <p class="muted">None.</p>
        }
      </section>
    </main>
  `,
})
export class Kitchen {
  protected queue = inject(QueueService);
  protected waiting = computed(() => this.queue.orders().filter((o) => o.status === 'new'));
  protected baking = computed(() => this.queue.orders().filter((o) => o.status === 'in-progress'));
  protected baked = computed(() => this.queue.orders().filter((o) => o.status === 'ready'));
}
