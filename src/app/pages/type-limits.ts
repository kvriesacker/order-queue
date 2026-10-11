import { Component, computed, inject } from '@angular/core';
import { kitchenLeft, typeSold } from '../models';
import { QueueService } from '../queue.service';

/**
 * For the kitchen: how many of each pizza it can still make, to change as ingredients run
 * low. Ordered pizzas it hasn't prepared yet count as part of that, so the kitchen just counts
 * its ingredients. The maximum follows: what's prepared plus what's left.
 */
@Component({
  selector: 'app-type-limits',
  template: `
    <ul class="type-limits">
      @for (t of types(); track t.name) {
        <li [class.out]="t.sellable === 0">
          <span class="type-name" [style.border-left-color]="t.color">{{ t.name }}</span>
          <span class="type-count muted">{{ t.sold }} sold</span>
          <span class="type-left-edit">
            <button
              class="btn small step"
              type="button"
              [disabled]="t.left === null || t.left === 0"
              (click)="queue.setTypeLeft(t.name, t.left! - 1)"
              [attr.aria-label]="'One less ' + t.name"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              max="99999"
              inputmode="numeric"
              placeholder="No limit"
              [value]="t.left ?? ''"
              (change)="setLeft(t.name, $any($event.target))"
              [attr.aria-label]="t.name + ' left'"
            />
            <button
              class="btn small step"
              type="button"
              [disabled]="t.left === null"
              (click)="queue.setTypeLeft(t.name, t.left! + 1)"
              [attr.aria-label]="'One more ' + t.name"
            >
              +
            </button>
          </span>
          @if (t.sellable === 0) {
            <strong class="type-out">Sold out</strong>
          } @else {
            <button
              class="btn small danger"
              type="button"
              (click)="queue.setTypeLimit(t.name, { soldOut: true })"
            >
              Sold out
            </button>
          }
          @if (t.left !== null) {
            <button class="btn ghost small type-unlimited" type="button" (click)="queue.setTypeLeft(t.name, null)">
              No limit
            </button>
          }
        </li>
      } @empty {
        <li class="muted">No pizzas on the menu.</li>
      }
    </ul>
    <p class="muted small">
      Type how many you can still make, counting the ordered pizzas you haven’t prepared yet.
      Leave it empty for no limit.
    </p>
  `,
})
export class TypeLimits {
  protected queue = inject(QueueService);
  protected types = computed(() => {
    const state = this.queue.state();
    if (!state) return [];
    const left = this.queue.typeLeft();
    return state.menu
      .filter((m) => m.enabled)
      .map((m) => ({
        name: m.name,
        color: m.color,
        sold: typeSold(state, m.name),
        /** What the kitchen can still make, including ordered pizzas not prepared yet. */
        left: kitchenLeft(state, m.name),
        /** What the order takers can still sell. */
        sellable: left.get(m.name) ?? null,
      }));
  });

  setLeft(name: string, input: HTMLInputElement) {
    const n = Number(input.value);
    this.queue.setTypeLeft(name, input.value.trim() === '' || !(n >= 0) ? null : Math.floor(n));
  }
}
