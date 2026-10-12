import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MenuItem } from '../models';
import { T } from '../i18n/i18n';

/** Check pizzas on or off, set an optional maximum per pizza, pick colors and add new ones. */
@Component({
  selector: 'app-menu-editor',
  imports: [FormsModule, T],
  template: `
    <ul class="menu-editor">
      @for (item of menu(); track $index) {
        <li [class.off]="!item.enabled">
          <label class="check">
            <input
              type="checkbox"
              [checked]="item.enabled"
              (change)="update($index, { enabled: $any($event.target).checked })"
            />
            <span class="name">{{ item.name }}</span>
          </label>
          <input
            type="number"
            class="item-price"
            min="0"
            max="1000"
            step="0.5"
            inputmode="decimal"
            [placeholder]="'€ ' + (defaultPrice() || '–')"
            [title]="'Price of this pizza (empty: the general price)' | t"
            [value]="item.price || ''"
            (change)="update($index, { price: priceFrom($any($event.target).value) })"
            [attr.aria-label]="'Price {name}' | t: { name: item.name }"
          />
          <input
            type="number"
            class="item-max"
            min="0"
            max="99999"
            inputmode="numeric"
            [placeholder]="'Max' | t"
            [title]="'How many of this pizza can be made (empty: no limit)' | t"
            [value]="item.max || ''"
            (change)="update($index, { max: maxFrom($any($event.target).value) })"
            [attr.aria-label]="'Maximum {name}' | t: { name: item.name }"
          />
          <input
            type="color"
            class="swatch"
            [value]="item.color"
            (input)="update($index, { color: $any($event.target).value })"
            [attr.aria-label]="'Color for {name}' | t: { name: item.name }"
          />
          <button
            class="btn ghost small"
            type="button"
            (click)="remove($index)"
            [attr.aria-label]="'Remove' | t"
          >
            ✕
          </button>
        </li>
      }
    </ul>
    <!-- Not a <form>: the editor sits inside the create-queue form. -->
    <div class="inline">
      <input
        [(ngModel)]="newName"
        [ngModelOptions]="{ standalone: true }"
        (keydown.enter)="$event.preventDefault(); add()"
        [placeholder]="'Add a pizza…' | t"
        maxlength="40"
      />
      <input
        type="color"
        class="swatch"
        [(ngModel)]="newColor"
        [ngModelOptions]="{ standalone: true }"
        [attr.aria-label]="'Color for the new pizza' | t"
      />
      <button class="btn" type="button" [disabled]="!newName.trim()" (click)="add()">{{ 'Add' | t }}</button>
    </div>
    <p class="muted small">
      {{
        '€: a price for this pizza (empty: the general price below). Max: how many of a pizza the ingredients allow (empty: no limit).'
          | t
      }}
    </p>
    @if (duplicate()) {
      <p class="error">{{ 'That pizza is already on the list.' | t }}</p>
    }
  `,
})
export class MenuEditor {
  readonly menu = model.required<MenuItem[]>();
  /** The general price, shown where a pizza has no price of its own. */
  readonly defaultPrice = input(0);
  protected newName = '';
  protected newColor = randomColor();
  protected duplicate = signal(false);

  update(index: number, change: Partial<MenuItem>) {
    this.menu.update((menu) => menu.map((m, i) => (i === index ? { ...m, ...change } : m)));
  }

  protected priceFrom(value: string): number {
    const n = Number(value);
    return value.trim() && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : 0;
  }

  protected maxFrom(value: string): number {
    const n = Number(value);
    return value.trim() && n > 0 ? Math.floor(n) : 0;
  }

  remove(index: number) {
    this.menu.update((menu) => menu.filter((_, i) => i !== index));
  }

  add() {
    const name = this.newName.trim();
    if (!name) return;
    if (this.menu().some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      this.duplicate.set(true);
      return;
    }
    this.duplicate.set(false);
    this.menu.update((menu) => [...menu, { name, color: this.newColor, enabled: true }]);
    this.newName = '';
    this.newColor = randomColor();
  }
}

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  // A saturated, mid-light color converted from HSL to hex.
  const s = 0.7,
    l = 0.5;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
