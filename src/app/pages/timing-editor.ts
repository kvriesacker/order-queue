import { Component, model } from '@angular/core';
import { Timing } from '../models';

const FIELDS: { key: keyof Timing; label: string; hint: string }[] = [
  { key: 'prepareMinutes', label: 'Prepare', hint: 'minutes per pizza in the kitchen' },
  { key: 'bakeMinutes', label: 'Bake', hint: 'minutes in the oven' },
  { key: 'counterMinutes', label: 'Counter', hint: 'minutes to call the order once baked' },
];

/** The host's starting guess for how long each phase takes. */
@Component({
  selector: 'app-timing-editor',
  template: `
    <div class="grid3">
      @for (f of fields; track f.key) {
        <label>
          <span
            >{{ f.label }} <span class="muted">({{ f.hint }})</span></span
          >
          <input
            type="number"
            min="0.5"
            max="180"
            step="0.5"
            inputmode="decimal"
            [value]="timing()[f.key]"
            (input)="set(f.key, $any($event.target).valueAsNumber)"
          />
        </label>
      }
    </div>
    <p class="hint">
      These are starting estimates. As pizzas get prepared, baked and called, each phase follows the
      real times.
    </p>
  `,
})
export class TimingEditor {
  readonly timing = model.required<Timing>();
  protected fields = FIELDS;

  set(key: keyof Timing, value: number) {
    if (!(value > 0)) return;
    this.timing.update((t) => ({ ...t, [key]: value }));
  }
}
