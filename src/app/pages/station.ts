import { Component, DestroyRef, computed, inject, input } from '@angular/core';
import { Order, PizzaStatus, textOn } from '../models';
import { QueueService } from '../queue.service';
import { Eta } from './eta';
import { TypeLimits } from './type-limits';
import { Ovens } from './ovens';
import { T, t } from '../i18n/i18n';
import { enterFocus, focusMode, leaveFocus } from '../focus';

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
    progress: '{done}/{total} prepared',
    recent: 'Just prepared',
  },
  oven: {
    title: 'For the oven',
    empty: 'Nothing waiting for the oven.',
    from: 'prepared' as PizzaStatus,
    to: 'baked' as PizzaStatus,
    action: 'Baked',
    progress: '{done}/{total} baked',
    recent: 'Just baked',
  },
};


@Component({
  selector: 'app-station',
  imports: [Eta, TypeLimits, Ovens, T],
  template: `
    <main class="page kitchen" [class.focus]="focus()">
      <section class="column">
        <h2 class="station-head">
          {{ config().title | t }} <span class="count">{{ waiting() }}</span>
          @if (focus()) {
            <button class="btn ghost small focus-toggle" type="button" (click)="leaveFocus()">
              {{ 'Exit full screen' | t }}
            </button>
          } @else {
            <button class="btn small focus-toggle" type="button" (click)="enterFocus()">
              ⛶ {{ 'Full screen' | t }}
            </button>
          }
        </h2>
        <div class="kitchen-grid one-column">
          @for (entry of active(); track entry.order.id) {
            <article class="order kitchen-order" [class]="entry.order.status">
              <header>
                <span class="num">#{{ entry.order.number }}</span>
                @if (entry.order.customer) {
                  <span class="customer">{{ entry.order.customer }}</span>
                }
                <span class="age"
                  >{{ config().progress | t: { done: entry.done, total: entry.pizzas.length } }} ·
                  {{ age(entry.order) }}</span
                >
              </header>
              <app-eta [orderId]="entry.order.id" />
              @if (entry.order.note) {
                <p class="order-note">{{ entry.order.note }}</p>
              }
              <!-- Only what's left to tick off: a ticked pizza moves to the list on the right. -->
              <ul class="pizzas">
                @for (p of entry.todoPizzas; track p.item + '-' + p.unit) {
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
                      <button
                        class="btn success"
                        type="button"
                        (click)="set(entry.order, p, config().to)"
                      >
                        {{ config().action | t }}
                      </button>
                    </span>
                  </li>
                }
              </ul>
              @if (entry.earlier) {
                <p class="muted still-earlier">
                  {{ (entry.earlier === 1 ? '+{n} pizza still in the kitchen' : '+{n} pizzas still in the kitchen') | t: { n: entry.earlier } }}
                </p>
              }
            </article>
          } @empty {
            <p class="muted">{{ config().empty | t }}</p>
          }
        </div>
      </section>
      <section class="column narrow">
        <h2>{{ config().recent | t }}</h2>
        <ul class="recent">
          @for (r of recent(); track r.order.id + '-' + r.item + '-' + r.unit) {
            <li>
              <span class="recent-who">
                <strong>#{{ r.order.number }}</strong>
                <span class="chip" [style.background]="r.color" [style.color]="textOn(r.color)">{{
                  r.name
                }}</span>
              </span>
              <span class="muted recent-age">{{ ago(r.at) }}</span>
              <button
                class="btn ghost small"
                type="button"
                (click)="set(r.order, r, config().from)"
                [attr.aria-label]="'Undo {pizza} of order {n}' | t: { pizza: r.name, n: r.order.number }"
              >
                {{ 'Undo' | t }}
              </button>
            </li>
          } @empty {
            <li class="muted">{{ 'Nothing yet.' | t }}</li>
          }
        </ul>
        @if (focus()) {
          <!-- Full screen: only the pizzas to tick off and the ones just ticked. -->
        } @else if (station() === 'oven') {
          <h2>{{ 'Ovens' | t }}</h2>
          <app-ovens />
        }
        @if (focus()) {
        } @else if (station() === 'kitchen') {
          <h2>
            {{ 'Coming up for the oven' | t }} <span class="count">{{ forOven().length }}</span>
          </h2>
          @for (order of forOven(); track order.id) {
            <div class="mini">
              <strong>#{{ order.number }}</strong>
              <span class="muted">{{ '{n} prepared' | t: { n: order.prepared } }}</span>
            </div>
          } @empty {
            <p class="muted">{{ 'None.' | t }}</p>
          }
          <h2 class="types-head">{{ 'Pizzas left' | t }}</h2>
          <app-type-limits />
        } @else {
          <h2>
            {{ 'Baked, waiting at counter' | t }} <span class="count">{{ baked().length }}</span>
          </h2>
          @for (order of baked(); track order.id) {
            <div class="mini">
              <strong>#{{ order.number }}</strong>
              <button
                class="btn ghost small"
                type="button"
                (click)="queue.setStatus(order, 'in-progress')"
              >
                {{ 'Undo' | t }}
              </button>
            </div>
          } @empty {
            <p class="muted">{{ 'None.' | t }}</p>
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
  protected focus = focusMode;
  protected enterFocus = enterFocus;
  protected leaveFocus = leaveFocus;

  constructor() {
    // Full screen belongs to this page; going to another tab shows the menu again.
    inject(DestroyRef).onDestroy(() => {
      if (focusMode()) leaveFocus();
    });
  }

  /** Orders with at least one pizza for this station, oldest first. */
  protected active = computed(() => {
    const { from, to } = this.config();
    return this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress')
      .map((order) => {
        const pizzas = byType(pizzaRows(order), this.queue.state()?.menu ?? []);
        const todoPizzas = pizzas.filter((p) => p.status === from);
        return { order, pizzas, todoPizzas, todo: todoPizzas.length, done: 0, earlier: 0 };
      })
      .filter((e) => e.todo > 0)
      .map((e) => ({
        ...e,
        done: e.pizzas.filter((p) => isPast(p.status, to)).length,
        // For the oven: pizzas of this order the kitchen hasn't prepared yet.
        earlier: e.pizzas.filter((p) => !isPast(p.status, from)).length,
      }));
  });
  /**
   * The pizzas this station marked most recently that are still at its step, newest first,
   * so a mistake can be undone after the order has left the list.
   */
  protected recent = computed(() => {
    const { to } = this.config();
    return this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress' || o.status === 'ready')
      .flatMap((order) =>
        pizzaRows(order)
          .filter((p) => p.status === to)
          .map((p) => ({ ...p, order, at: order.items[p.item].times[p.unit]?.[to as 'prepared' | 'baked'] ?? 0 })),
      )
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT);
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

  ago(at: number): string {
    const minutes = Math.floor((this.queue.now() - at) / 60000);
    return !at || minutes < 1 ? t('just now') : t('{n} min ago', { n: minutes });
  }

  age(order: Order): string {
    const minutes = Math.floor((this.queue.now() - order.createdAt) / 60000);
    return minutes < 1 ? t('just now') : t('{n} min', { n: minutes });
  }
}

/** How many recently marked pizzas each station sees, to undo a mistake. */
const RECENT = 8;

const ORDER: PizzaStatus[] = ['new', 'prepared', 'baked'];

function isPast(status: PizzaStatus, step: PizzaStatus): boolean {
  return ORDER.indexOf(status) >= ORDER.indexOf(step);
}

/**
 * An order's pizzas grouped by type, in menu order (pizzas not on the menu after those),
 * so the same pizzas are made together. Pizzas of one type keep their order.
 */
export function byType<T extends { name: string }>(rows: T[], menu: { name: string }[]): T[] {
  const rank = (name: string) => {
    const i = menu.findIndex((m) => m.name === name);
    return i < 0 ? menu.length : i;
  };
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => rank(a.row.name) - rank(b.row.name) || a.row.name.localeCompare(b.row.name) || a.i - b.i)
    .map((x) => x.row);
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
