import { Component, computed, inject } from '@angular/core';
import { typeSold } from '../models';
import { QueueService } from '../queue.service';

/**
 * For the kitchen: how many of each pizza can still be sold, to change as ingredients run
 * low. The maximum follows: what's already sold plus what's left.
 */
@Component({
  selector: 'app-type-limits',
  template: `
    <ul class="type-limits">
      @for (t of types(); track t.name) {
        <li [class.out]="t.left === 0">
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
          @if (t.left === 0) {
            <strong class="type-out">Sold out</strong>
          } @else {
            <button class="btn small danger" type="button" (click)="queue.setTypeLeft(t.name, 0)">
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
      Type how many you can still make, or leave it empty for no limit. 0 is sold out.
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
        left: left.get(m.name) ?? null,
      }));
  });

  setLeft(name: string, input: HTMLInputElement) {
    const n = Number(input.value);
    this.queue.setTypeLeft(name, input.value.trim() === '' || !(n >= 0) ? null : Math.floor(n));
  }
}
