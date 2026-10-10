import { Component, computed, inject, input } from '@angular/core';
import { clockTime, minutesUntil } from '../estimate';
import { QueueService } from '../queue.service';

/** "Ready ≈ 18:42 · 12 min" for an open order; nothing once it's baked. */
@Component({
  selector: 'app-eta',
  template: `
    @if (eta(); as t) {
      <span class="eta" [title]="'Estimated ready time'"
        >⏱ {{ compact() ? '' : 'Ready ≈ ' }}{{ clock(t)
        }}<span class="eta-min"> · {{ until(t) }}</span></span
      >
    }
  `,
})
export class Eta {
  private queue = inject(QueueService);
  readonly orderId = input.required<string>();
  readonly compact = input(false);
  protected eta = computed(() => this.queue.estimates().get(this.orderId()));
  protected clock = clockTime;
  protected until = (t: number) => minutesUntil(t, this.queue.now());
}
