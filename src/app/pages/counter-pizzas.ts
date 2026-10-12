import { Component, computed, inject, input } from '@angular/core';
import { Order, STAGE_LABELS, pizzaCalled, pizzaStage, textOn } from '../models';
import { QueueService } from '../queue.service';
import { T } from '../i18n/i18n';
import { byType } from './station';

/** Part of a big order is on the customer screen (or given), the rest isn't yet. */
export function partlyCalled(order: Order): boolean {
  return (
    ['new', 'in-progress', 'ready'].includes(order.status) &&
    order.items.some((i) => i.times.some((t) => t?.called || t?.handed))
  );
}

/** Some pizza of the order is baked and not yet on the customer screen. */
export function waitingAtCounter(order: Order): boolean {
  if (!['new', 'in-progress', 'ready'].includes(order.status)) return false;
  const units = order.items.flatMap((item, i) => item.units.map((u, j) => ({ u, called: pizzaCalled(order, i, j) })));
  return units.some((x) => !x.called) && (order.status === 'ready' || units.some((x) => x.u === 'baked'));
}

/**
 * An order's pizzas one by one at the counter. "kitchen" lists the ones not on the customer
 * screen yet: in a big order each baked one can go there on its own. "screen" lists the ones
 * on the customer screen, which are handed over one by one while the rest isn't ready.
 * When the whole order is ready at once, the order's own buttons are enough.
 */
@Component({
  selector: 'app-counter-pizzas',
  imports: [T],
  template: `
    <ul class="counter-pizzas">
      @for (p of pizzas(); track p.item + '-' + p.unit) {
        <li [class.handed]="p.handed" [class.waiting]="p.status !== 'baked'">
          <span class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">{{ p.name }}</span>
          @if (p.note) {
            <em class="note">{{ p.note }}</em>
          }
          <span class="counter-pizza-end">
            @if (mode() === 'screen') {
              @if (p.handed) {
                <span class="done">{{ '✓ Handed over' | t }}</span>
                @if (perPizza()) {
                  <button class="btn ghost small" type="button" (click)="hand(p, false)"
                    [attr.aria-label]="'Undo handing over {pizza}' | t: { pizza: p.name }">
                    {{ 'Undo' | t }}
                  </button>
                }
              } @else if (perPizza()) {
                <button class="btn ghost small" type="button" (click)="call(p, false)"
                  [attr.aria-label]="'Take {pizza} off the customer screen' | t: { pizza: p.name }">
                  {{ 'Undo' | t }}
                </button>
                <button class="btn small primary" type="button" (click)="hand(p, true)"
                  [attr.aria-label]="'Hand over {pizza}' | t: { pizza: p.name }">
                  {{ 'Hand over' | t }}
                </button>
              }
            } @else if (p.status === 'baked' && perPizza()) {
              <button class="btn small" type="button" (click)="call(p, true)"
                [attr.aria-label]="'Show {pizza} on the customer screen' | t: { pizza: p.name }">
                {{ 'To customer screen' | t }}
              </button>
            } @else {
              <span class="muted">{{ step[p.stage ?? 'ordered'] | t }}</span>
            }
          </span>
        </li>
      }
    </ul>
  `,
})
export class CounterPizzas {
  private queue = inject(QueueService);
  readonly order = input.required<Order>();
  /** Which column: pizzas still to put on the customer screen, or the ones on it. */
  readonly mode = input<'kitchen' | 'screen'>('kitchen');
  protected textOn = textOn;
  protected step = STAGE_LABELS;

  /**
   * Buttons per pizza: only while the order is split, or could be (a big order not fully
   * baked yet). A whole order ready at once uses the order's own buttons.
   */
  protected perPizza = computed(() => {
    const order = this.order();
    const count = order.items.reduce((n, i) => n + i.units.length, 0);
    if (count < 2) return false;
    if (this.mode() === 'screen') return partlyCalled(order);
    return partlyCalled(order) || order.status !== 'ready';
  });

  protected pizzas = computed(() => {
    const order = this.order();
    const screen = this.mode() === 'screen';
    const rows = order.items
      .flatMap((item, i) =>
        item.units.map((status, u) => ({
          item: i,
          unit: u,
          name: item.name,
          note: item.note,
          color: item.color,
          status,
          stage: pizzaStage(order, i, u),
          called: pizzaCalled(order, i, u),
          handed: !!item.times[u]?.handed,
        })),
      )
      .filter((p) => p.called === screen);
    return byType(rows, this.queue.state()?.menu ?? []);
  });

  protected call(p: { item: number; unit: number }, called: boolean) {
    this.queue.callPizza(this.order(), p.item, p.unit, called);
  }

  protected hand(p: { item: number; unit: number }, handed: boolean) {
    this.queue.handOver(this.order(), p.item, p.unit, handed);
  }
}
