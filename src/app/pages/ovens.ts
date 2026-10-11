import { Component, computed, inject } from '@angular/core';
import { QueueService } from '../queue.service';

/**
 * For the oven station: each oven with a switch to mark it out of order. Estimates only
 * count working ovens.
 */
@Component({
  selector: 'app-ovens',
  template: `
    <ul class="ovens-list">
      @for (oven of ovens(); track oven.index) {
        <li class="oven" [class.broken]="oven.out">
          <strong>Oven {{ oven.index + 1 }}</strong>
          @if (oven.out) {
            <span class="oven-state">Out of order</span>
          }
          <button
            class="btn small"
            [class.danger]="!oven.out"
            [class.ghost]="oven.out"
            type="button"
            (click)="queue.setOvenOut(oven.index, !oven.out)"
          >
            {{ oven.out ? 'Working again' : 'Mark out of order' }}
          </button>
        </li>
      }
    </ul>
    @if (ovens().length && working() === 0) {
      <p class="oven-waiting">Every oven is out of order: no ready times until one works again.</p>
    }
  `,
})
export class Ovens {
  protected queue = inject(QueueService);
  protected ovens = computed(() => {
    const state = this.queue.state();
    if (!state) return [];
    return Array.from({ length: state.timing.ovens }, (_, index) => ({
      index,
      out: state.ovensOut.includes(index),
    }));
  });
  protected working = computed(() => this.ovens().filter((o) => !o.out).length);
}
