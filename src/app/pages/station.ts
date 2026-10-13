import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Order, PizzaStatus, PizzaTimes, inOven, ovenLoad, textOn } from '../models';
import { QueueService } from '../queue.service';
import { Eta } from './eta';
import { TypeLimits } from './type-limits';
import { Ovens } from './ovens';
import { T, t } from '../i18n/i18n';
import { focusMode } from '../focus';
import { FocusToggle } from './focus-toggle';
import { UndoIcon } from './undo-icon';

/** One pizza of an order, so each station handles pizzas one by one. */
interface PizzaRow {
  item: number;
  unit: number;
  name: string;
  note: string;
  color: string;
  status: PizzaStatus;
  times: PizzaTimes;
}

/**
 * Kitchen and oven share this page. The kitchen marks a pizza prepared once it's done. The
 * oven has two steps (Koen's choice): it puts a pizza in one of its ovens (only while that
 * oven has room), which starts a bake timer, and marks it baked when it comes out, which
 * frees the spot.
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
  imports: [Eta, TypeLimits, Ovens, FocusToggle, UndoIcon, T],
  template: `
    <main class="page kitchen" [class.focus]="focus()">
      <section class="column">
        <h2 class="station-head">
          {{ config().title | t }} <span class="count">{{ waiting() }}</span>
          <app-focus-toggle />
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
                  <!-- The whole row ticks the pizza off; the button is there to show what a tap does. -->
                  <li
                    [class]="rowClass(p)"
                    [class.tap-row]="rowTap(p) !== null"
                    [class.in-oven]="isInOven(p)"
                    [class.oven-row]="station() === 'oven'"
                    [class.bake-done]="isInOven(p) && bakeLeft(p) <= 0"
                    (click)="tapRow(entry.order, p)"
                  >
                    <span class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">
                      {{ p.name }}
                    </span>
                    <span class="pizza-meta">
                      @if (p.note) {
                        <em class="note">{{ p.note }}</em>
                      }
                    </span>
                    <span class="pizza-actions">
                      @if (station() === 'oven' && !isInOven(p)) {
                        <!-- First into an oven (one button per working oven), then Baked. -->
                        @for (oven of ovens(); track oven.index) {
                          <button
                            class="btn primary oven-in"
                            type="button"
                            [disabled]="oven.full"
                            (click)="$event.stopPropagation(); putIn(entry.order, p, oven.index)"
                          >
                            {{ (ovens().length === 1 ? 'In the oven' : 'In oven {n}') | t: { n: oven.index + 1 } }}
                          </button>
                        } @empty {
                          <span class="muted">{{ 'Every oven is out of order' | t }}</span>
                        }
                      } @else {
                        @if (isInOven(p)) {
                          @let left = bakeLeft(p);
                          <span class="bake-timer" [class.done]="left <= 0" role="timer">
                            @if (ovenCount() > 1) {
                              <small>{{ 'Oven {n}' | t: { n: (p.times.oven ?? 0) + 1 } }}</small>
                            }
                            @if (left <= 0) {
                              <strong class="take-out">{{ 'Take it out!' | t }}</strong>
                            }
                            {{ (left > 0 ? '{time} left' : 'Done {time} ago') | t: { time: clock(left) } }}
                          </span>
                        }
                        <button class="btn success" type="button">
                          {{ config().action | t }}
                        </button>
                      }
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
              @if (station() === 'kitchen' && isInOven(r)) {
                <span class="muted recent-oven">{{ 'In the oven' | t }}</span>
              } @else {
              <button
                class="btn ghost small undo"
                type="button"
                [title]="'Undo' | t"
                (click)="set(r.order, r, config().from)"
                [attr.aria-label]="'Undo {pizza} of order {n}' | t: { pizza: r.name, n: r.order.number }"
              >
                <app-undo-icon />
              </button>
              }
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
                class="btn ghost small undo"
                type="button"
                [title]="'Undo' | t"
                [attr.aria-label]="'Undo' | t"
                (click)="queue.setStatus(order, 'in-progress')"
              >
                <app-undo-icon />
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

  /** Ticks every second while the oven is open, for the bake timers. */
  private tick = signal(Date.now());
  /** The ovens that work, and whether each is full. */
  protected ovens = computed(() => {
    const state = this.queue.state();
    if (!state) return [];
    const load = ovenLoad(state);
    return load
      .map((n, index) => ({ index, full: n >= state.timing.pizzasPerOven }))
      .filter((o) => !state.ovensOut.includes(o.index));
  });
  protected ovenCount = computed(() => this.queue.state()?.timing.ovens ?? 1);
  protected isInOven = (p: PizzaRow) => inOven(p.status, p.times);

  constructor() {
    const timer = setInterval(() => this.station() === 'oven' && this.tick.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  set(order: Order, p: PizzaRow, status: PizzaStatus) {
    this.queue.setPizza(order, p.item, p.unit, status);
  }

  putIn(order: Order, p: PizzaRow, oven: number) {
    this.queue.putInOven(order, p.item, p.unit, oven);
  }

  /**
   * What tapping the row does: in the kitchen and for a pizza in the oven, the step's own
   * button; for a pizza waiting for the oven, putting it in when there's one oven with room.
   */
  protected rowTap(p: PizzaRow): 'step' | number | null {
    if (this.station() === 'kitchen' || this.isInOven(p)) return 'step';
    const ovens = this.ovens();
    return ovens.length === 1 && !ovens[0].full ? ovens[0].index : null;
  }

  tapRow(order: Order, p: PizzaRow) {
    const tap = this.rowTap(p);
    if (tap === 'step') this.set(order, p, this.config().to);
    else if (tap !== null) this.putIn(order, p, tap);
  }

  /** Milliseconds this pizza still needs in the oven (below 0 when it's overdue). */
  protected bakeLeft(p: PizzaRow): number {
    const minutes = this.queue.state()?.timing.bakeMinutes ?? 0;
    return (p.times.inOven ?? 0) + minutes * 60000 - this.tick();
  }

  /** "6:05" for a duration, either way. */
  protected clock(ms: number): string {
    const seconds = Math.round(Math.abs(ms) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
      times: item.times[u] ?? {},
    })),
  );
}
