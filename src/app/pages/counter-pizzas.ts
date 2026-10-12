import { Component, computed, inject, input } from '@angular/core';
import { Order, PizzaStatus, textOn } from '../models';
import { QueueService } from '../queue.service';
import { T } from '../i18n/i18n';
import { byType } from './station';

const STEP: Record<PizzaStatus, string> = {
  new: 'In the kitchen',
  prepared: 'In the oven',
  baked: 'Baked',
};

/**
 * An order's pizzas one by one at the counter: where each one is, and for a big order the
 * baked ones can go to the customer before the rest is done.
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
            @if (p.handed) {
              <span class="done">{{ '✓ Handed over' | t }}</span>
              <button class="btn ghost small" type="button" (click)="hand(p, false)"
                [attr.aria-label]="'Undo handing over {pizza}' | t: { pizza: p.name }">
                {{ 'Undo' | t }}
              </button>
            } @else if (p.status === 'baked') {
              @if (pizzas().length > 1) {
                <button class="btn small" type="button" (click)="hand(p, true)"
                  [attr.aria-label]="'Hand over {pizza}' | t: { pizza: p.name }">
                  {{ 'Hand over' | t }}
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
        handed: !!item.times[u]?.handed,
      })),
    );
    return byType(rows, this.queue.state()?.menu ?? []);
  });

  protected hand(p: { item: number; unit: number }, handed: boolean) {
    this.queue.handOver(this.order(), p.item, p.unit, handed);
  }
}
