import { Component, computed, inject } from '@angular/core';
import { typeSold } from '../models';
import { QueueService } from '../queue.service';

/**
 * For the kitchen: how many of each pizza are sold, an optional maximum per type (what the
 * ingredients allow) and a switch to mark a type sold out.
 */
@Component({
  selector: 'app-type-limits',
  template: `
    <ul class="type-limits">
      @for (t of types(); track t.name) {
        <li [class.out]="t.left === 0">
          <span class="type-name" [style.border-left-color]="t.color">{{ t.name }}</span>
          <span class="type-count">
            @if (t.soldOut) {
              <strong>Sold out</strong>
            } @else if (t.left !== null) {
              <strong>{{ t.left }}</strong> left
            }
            <span class="muted">{{ t.sold }} sold</span>
          </span>
          <label class="type-max">
            <span>Max</span>
            <input
              type="number"
              min="0"
              max="99999"
              inputmode="numeric"
              placeholder="–"
              [value]="t.max || ''"
              (change)="setMax(t.name, $any($event.target))"
              [attr.aria-label]="'Maximum ' + t.name"
            />
          </label>
          <button
            class="btn small"
            type="button"
            [class.danger]="!t.soldOut"
            [attr.aria-pressed]="t.soldOut"
            (click)="queue.setTypeLimit(t.name, { soldOut: !t.soldOut })"
          >
            {{ t.soldOut ? 'Available again' : 'Mark sold out' }}
          </button>
        </li>
      } @empty {
        <li class="muted">No pizzas on the menu.</li>
      }
    </ul>
    <p class="muted small">Leave Max empty for no limit. Sold out stops new orders of that pizza.</p>
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
        max: m.max ?? 0,
        soldOut: !!m.soldOut,
        sold: typeSold(state, m.name),
        left: left.get(m.name) ?? null,
      }));
  });

  setMax(name: string, input: HTMLInputElement) {
    const n = Number(input.value);
    const max = input.value.trim() === '' || !(n > 0) ? 0 : Math.floor(n);
    this.queue.setTypeLimit(name, { max });
  }
}
