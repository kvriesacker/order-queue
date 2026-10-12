import { Component, computed, inject, input } from '@angular/core';
import { Order, PizzaStatus, pizzaCalled, textOn } from '../models';
import { QueueService } from '../queue.service';
import { T } from '../i18n/i18n';
import { byType } from './station';

const STEP: Record<PizzaStatus, string> = {
  new: 'In the kitchen',
  prepared: 'In the oven',
  baked: 'Baked',
};

/**
 * An order's pizzas one by one at the counter. In a big order each baked pizza can go on the
 * customer screen on its own, and from there to the customer, before the rest is done.
 */
@Component({
  selector: 'app-counter-pizzas',
  imports: [T],
  template: `
    <ul class="counter-pizzas">
      @for (p of pizzas(); track p.item + '-' + p.unit) {
        <li [class.handed]="p.handed" [class.waiting]="p.status !== 'baked'" [class.called]="p.called && !p.handed">
          <span class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">{{ p.name }}</span>
          @if (p.note) {
            <em class="note">{{ p.note }}</em>
          }
          <span class="counter-pizza-end">
            @if (p.handed) {
              <span class="done">{{ '✓ Handed over' | t }}</span>
              <button class="btn ghost small" type="button" (click)="hand(p, false)"
                [attr.aria-label]="'Undo handing over {pizza}' | t: { pizza: p.name }">
                {{ 'Undo' | t }}
              </button>
            } @else if (p.called) {
              @if (!onScreen()) {
                <span class="muted">{{ 'On the customer screen' | t }}</span>
                <button class="btn ghost small" type="button" (click)="call(p, false)"
                  [attr.aria-label]="'Take {pizza} off the customer screen' | t: { pizza: p.name }">
                  {{ 'Undo' | t }}
                </button>
              }
              @if (several()) {
                <button class="btn small primary" type="button" (click)="hand(p, true)"
                  [attr.aria-label]="'Hand over {pizza}' | t: { pizza: p.name }">
                  {{ 'Hand over' | t }}
                </button>
              }
            } @else if (p.status === 'baked') {
              @if (several()) {
                <button class="btn small" type="button" (click)="call(p, true)"
                  [attr.aria-label]="'Show {pizza} on the customer screen' | t: { pizza: p.name }">
                  {{ 'To customer screen' | t }}
                </button>
              } @else {
                <span class="muted">{{ step.baked | t }}</span>
              }
            } @else {
              <span class="muted">{{ step[p.status] | t }}</span>
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
  protected textOn = textOn;
  protected step = STEP;
  /** Pizza by pizza only makes sense when there's more than one. */
  protected several = computed(() => this.order().items.reduce((n, i) => n + i.units.length, 0) > 1);
  /** The whole order is on the customer screen. */
  protected onScreen = computed(() => this.order().status === 'ready-for-customer');

  protected pizzas = computed(() => {
    const order = this.order();
    const rows = order.items.flatMap((item, i) =>
      item.units.map((status, u) => ({
        item: i,
        unit: u,
        name: item.name,
        note: item.note,
        color: item.color,
        status,
        called: pizzaCalled(order, i, u),
        handed: !!item.times[u]?.handed,
      })),
    );
    return byType(rows, this.queue.state()?.menu ?? []);
  });

  protected call(p: { item: number; unit: number }, called: boolean) {
    this.queue.callPizza(this.order(), p.item, p.unit, called);
  }

  protected hand(p: { item: number; unit: number }, handed: boolean) {
    this.queue.handOver(this.order(), p.item, p.unit, handed);
  }
}
