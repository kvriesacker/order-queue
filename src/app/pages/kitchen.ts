import { Component, computed, inject } from '@angular/core';
import { Order, textOn } from '../models';
import { QueueService } from '../queue.service';

/** One pizza of an order, so the kitchen can bake them one by one. */
interface PizzaRow {
  item: number;
  unit: number;
  name: string;
  note: string;
  color: string;
  label: string;
  status: Order['items'][number]['units'][number];
}

@Component({
  selector: 'app-kitchen',
  template: `
    <main class="page kitchen">
      <section class="column">
        <h2>
          To bake <span class="count">{{ active().length }}</span>
        </h2>
        <div class="kitchen-grid">
          @for (entry of active(); track entry.order.id) {
            <article class="order kitchen-order" [class]="entry.order.status">
              <header>
                <span class="num">#{{ entry.order.number }}</span>
                @if (entry.order.customer) {
                  <span class="customer">{{ entry.order.customer }}</span>
                }
                <span class="age"
                  >{{ entry.done }}/{{ entry.pizzas.length }} ready · {{ age(entry.order) }}</span
                >
              </header>
              @if (entry.order.note) {
                <p class="order-note">{{ entry.order.note }}</p>
              }
              <ul class="pizzas">
                @for (p of entry.pizzas; track p.item + '-' + p.unit) {
                  <li [class]="p.status">
                    <span class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">
                      {{ p.name }}
                    </span>
                    <span class="pizza-meta">
                      @if (p.label) {
                        <span class="muted">{{ p.label }}</span>
                      }
                      @if (p.note) {
                        <em class="note">{{ p.note }}</em>
                      }
                    </span>
                    <span class="pizza-actions">
                      @switch (p.status) {
                        @case ('new') {
                          <button
                            class="btn primary"
                            type="button"
                            (click)="set(entry.order, p, 'in-progress')"
                          >
                            In the oven
                          </button>
                        }
                        @case ('in-progress') {
                          <button
                            class="btn ghost small"
                            type="button"
                            (click)="set(entry.order, p, 'new')"
                          >
                            Undo
                          </button>
                          <button
                            class="btn success"
                            type="button"
                            (click)="set(entry.order, p, 'ready')"
                          >
                            Ready
                          </button>
                        }
                        @case ('ready') {
                          <span class="done">✓ Ready</span>
                          <button
                            class="btn ghost small"
                            type="button"
                            (click)="set(entry.order, p, 'in-progress')"
                          >
                            Undo
                          </button>
                        }
                      }
                    </span>
                  </li>
                }
              </ul>
            </article>
          } @empty {
            <p class="muted">Nothing to bake. 🎉</p>
          }
        </div>
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
  protected textOn = textOn;

  protected active = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress')
      .map((order) => {
        const pizzas = pizzaRows(order);
        return { order, pizzas, done: pizzas.filter((p) => p.status === 'ready').length };
      }),
  );
  protected baked = computed(() => this.queue.orders().filter((o) => o.status === 'ready'));

  set(order: Order, p: PizzaRow, status: PizzaRow['status']) {
    this.queue.setPizza(order, p.item, p.unit, status);
  }

  age(order: Order): string {
    const minutes = Math.floor((this.queue.now() - order.createdAt) / 60000);
    return minutes < 1 ? 'just now' : `${minutes} min`;
  }
}

function pizzaRows(order: Order): PizzaRow[] {
  return order.items.flatMap((item, i) =>
    item.units.map((status, u) => ({
      item: i,
      unit: u,
      name: item.name,
      note: item.note,
      color: item.color,
      label: item.qty > 1 ? `${u + 1} of ${item.qty}` : '',
      status,
    })),
  );
}
