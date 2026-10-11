import { Component, computed, inject, input } from '@angular/core';
import { Order, PizzaStatus, textOn } from '../models';
import { QueueService } from '../queue.service';
import { Eta } from './eta';
import { TypeLimits } from './type-limits';

/** One pizza of an order, so each station handles pizzas one by one. */
interface PizzaRow {
  item: number;
  unit: number;
  name: string;
  note: string;
  color: string;
  status: PizzaStatus;
}

/**
 * Kitchen and oven share this page. Each station only confirms its own step once it's
 * done: the kitchen marks a pizza prepared, the oven marks it baked.
 */
const STATIONS = {
  kitchen: {
    title: 'To prepare',
    empty: 'Nothing to prepare. 🎉',
    from: 'new' as PizzaStatus,
    to: 'prepared' as PizzaStatus,
    action: 'Prepared',
    done: '✓ Prepared',
  },
  oven: {
    title: 'For the oven',
    empty: 'Nothing waiting for the oven.',
    from: 'prepared' as PizzaStatus,
    to: 'baked' as PizzaStatus,
    action: 'Baked',
    done: '✓ Baked',
  },
};

const OTHER_STEP: Record<PizzaStatus, string> = {
  new: 'In the kitchen',
  prepared: 'Prepared',
  baked: 'Baked',
};

@Component({
  selector: 'app-station',
  imports: [Eta, TypeLimits],
  template: `
    <main class="page kitchen">
      <section class="column">
        <h2>
          {{ config().title }} <span class="count">{{ waiting() }}</span>
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
                  >{{ entry.done }}/{{ entry.pizzas.length }} {{ config().action.toLowerCase() }} ·
                  {{ age(entry.order) }}</span
                >
              </header>
              <app-eta [orderId]="entry.order.id" />
              @if (entry.order.note) {
                <p class="order-note">{{ entry.order.note }}</p>
              }
              <ul class="pizzas">
                @for (p of entry.pizzas; track p.item + '-' + p.unit) {
                  <li [class]="rowClass(p)">
                    <span class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">
                      {{ p.name }}
                    </span>
                    <span class="pizza-meta">
                      @if (p.note) {
                        <em class="note">{{ p.note }}</em>
                      }
                    </span>
                    <span class="pizza-actions">
                      @if (p.status === config().from) {
                        <button
                          class="btn success"
                          type="button"
                          (click)="set(entry.order, p, config().to)"
                        >
                          {{ config().action }}
                        </button>
                      } @else if (p.status === config().to) {
                        <span class="done">{{ config().done }}</span>
                        <button
                          class="btn ghost small"
                          type="button"
                          (click)="set(entry.order, p, config().from)"
                        >
                          Undo
                        </button>
                      } @else {
                        <span class="muted">{{ otherStep[p.status] }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </article>
          } @empty {
            <p class="muted">{{ config().empty }}</p>
          }
        </div>
      </section>
      <section class="column narrow">
        @if (station() === 'kitchen') {
          <h2>
            Coming up for the oven <span class="count">{{ forOven().length }}</span>
          </h2>
          @for (order of forOven(); track order.id) {
            <div class="mini">
              <strong>#{{ order.number }}</strong>
              <span class="muted">{{ order.prepared }} prepared</span>
            </div>
          } @empty {
            <p class="muted">None.</p>
          }
          <h2 class="types-head">Pizzas left</h2>
          <app-type-limits />
        } @else {
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
        }
      </section>
    </main>
  `,
})
export class Station {
  protected queue = inject(QueueService);
  /** Set from the route's data. */
  readonly station = input<'kitchen' | 'oven'>('kitchen');
  protected config = computed(() => STATIONS[this.station()]);
  protected textOn = textOn;
  protected otherStep = OTHER_STEP;

  /** Orders with at least one pizza for this station, oldest first. */
  protected active = computed(() => {
    const { from, to } = this.config();
    return this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress')
      .map((order) => {
        const pizzas = pizzaRows(order);
        return { order, pizzas, todo: pizzas.filter((p) => p.status === from).length, done: 0 };
      })
      .filter((e) => e.todo > 0)
      .map((e) => ({ ...e, done: e.pizzas.filter((p) => isPast(p.status, to)).length }));
  });
  protected waiting = computed(() => this.active().reduce((n, e) => n + e.todo, 0));

  /** For the kitchen: orders it has finished that are still with the oven. */
  protected forOven = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'in-progress')
      .map((o) => ({ ...o, units: o.items.flatMap((i) => i.units) }))
      .filter((o) => !o.units.includes('new'))
      .map((o) => ({ ...o, prepared: o.units.filter((u) => u === 'prepared').length })),
  );
  protected baked = computed(() => this.queue.orders().filter((o) => o.status === 'ready'));

  set(order: Order, p: PizzaRow, status: PizzaStatus) {
    this.queue.setPizza(order, p.item, p.unit, status);
  }

  rowClass(p: PizzaRow): string {
    const { from, to } = this.config();
    if (p.status === from) return 'todo';
    if (p.status === to) return 'done-row';
    return 'other';
  }

  age(order: Order): string {
    const minutes = Math.floor((this.queue.now() - order.createdAt) / 60000);
    return minutes < 1 ? 'just now' : `${minutes} min`;
  }
}

const ORDER: PizzaStatus[] = ['new', 'prepared', 'baked'];

function isPast(status: PizzaStatus, step: PizzaStatus): boolean {
  return ORDER.indexOf(status) >= ORDER.indexOf(step);
}

function pizzaRows(order: Order): PizzaRow[] {
  return order.items.flatMap((item, i) =>
    item.units.map((status, u) => ({
      item: i,
      unit: u,
      name: item.name,
      note: item.note,
      color: item.color,
      status,
    })),
  );
}
