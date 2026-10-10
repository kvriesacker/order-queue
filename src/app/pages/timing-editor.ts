import { Component, model } from '@angular/core';
import { Timing } from '../models';

/** The host's starting guess for how long pizzas take. */
@Component({
  selector: 'app-timing-editor',
  template: `
    <div class="grid2">
      <label>
        <span>Minutes until the first pizza is ready</span>
        <input
          type="number"
          min="1"
          max="180"
          inputmode="numeric"
          [value]="timing().firstMinutes"
          (input)="set('firstMinutes', $any($event.target).valueAsNumber)"
        />
      </label>
      <label>
        <span>Minutes between pizzas</span>
        <input
          type="number"
          min="0.5"
          max="60"
          step="0.5"
          inputmode="decimal"
          [value]="timing().perPizzaMinutes"
          (input)="set('perPizzaMinutes', $any($event.target).valueAsNumber)"
        />
      </label>
    </div>
    <p class="hint">
      This is the starting estimate. Once the oven has baked a few pizzas, ready times follow the
      real pace.
    </p>
  `,
})
export class TimingEditor {
  readonly timing = model.required<Timing>();

  set(key: keyof Timing, value: number) {
    if (!(value > 0)) return;
    this.timing.update((t) => ({ ...t, [key]: value }));
  }
}
