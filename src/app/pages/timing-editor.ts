import { Component, model } from '@angular/core';
import { Timing } from '../models';

type Field = { key: keyof Timing; label: string; hint: string };

const FIELDS: Field[] = [
  { key: 'prepareMinutes', label: 'Prepare', hint: 'minutes per pizza in the kitchen' },
  { key: 'bakeMinutes', label: 'Bake', hint: 'minutes in the oven' },
  { key: 'counterMinutes', label: 'Counter', hint: 'minutes to call the order once baked' },
];

const OVEN_FIELDS: Field[] = [
  { key: 'ovens', label: 'Ovens', hint: 'baking at the same time' },
  { key: 'pizzasPerOven', label: 'Pizzas per oven', hint: 'at once' },
];

/** The host's starting guess for how long each phase takes. */
@Component({
  selector: 'app-timing-editor',
  template: `
    <label class="max-pizzas">
      <span
        >Pizzas available in total
        <span class="muted">(how many you can make; 0 = no limit)</span></span
      >
      <input
        type="number"
        min="0"
        max="99999"
        step="1"
        inputmode="numeric"
        [value]="timing().maxPizzas"
        (input)="setMax($any($event.target).valueAsNumber)"
      />
    </label>
    <label class="max-pizzas">
      <span
        >Price per pizza in € <span class="muted">(0 = don't show prices; set other prices per pizza above)</span></span
      >
      <input
        type="number"
        min="0"
        max="1000"
        step="0.5"
        inputmode="decimal"
        [value]="timing().price"
        (input)="setPrice($any($event.target).valueAsNumber)"
        aria-label="Price per pizza"
      />
    </label>
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
    <div class="grid3 ovens">
      @for (f of ovenFields; track f.key) {
        <label>
          <span
            >{{ f.label }} <span class="muted">({{ f.hint }})</span></span
          >
          <input
            type="number"
            min="1"
            max="50"
            step="1"
            inputmode="numeric"
            [value]="timing()[f.key]"
            (input)="set(f.key, $any($event.target).valueAsNumber, true)"
          />
        </label>
      }
    </div>
    <p class="hint">
      The ovens limit how many pizzas bake at once. The times are starting estimates. As pizzas get prepared, baked and called, each phase follows the
      real times.
    </p>
  `,
})
export class TimingEditor {
  readonly timing = model.required<Timing>();
  protected fields = FIELDS;
  protected ovenFields = OVEN_FIELDS;

  setMax(value: number) {
    if (value >= 0 && Number.isInteger(value)) this.timing.update((t) => ({ ...t, maxPizzas: value }));
  }

  setPrice(value: number) {
    if (value >= 0 && value <= 1000) this.timing.update((t) => ({ ...t, price: Math.round(value * 100) / 100 }));
  }

  set(key: keyof Timing, value: number, whole = false) {
    if (!(value > 0) || (whole && !Number.isInteger(value))) return;
    this.timing.update((t) => ({ ...t, [key]: value }));
  }
}
