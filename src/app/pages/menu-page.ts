import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DEFAULT_TIMING, MenuItem, QueueState, Timing, pizzasLeft, pizzasSold } from '../models';
import { QueueService } from '../queue.service';
import { phaseTimes } from '../estimate';
import { MenuEditor } from './menu-editor';
import { TimingEditor } from './timing-editor';
import { Lang, T, isLang } from '../i18n/i18n';

/** Lets the staff change the menu and the starting time estimate while the queue runs. */
@Component({
  selector: 'app-menu-page',
  imports: [MenuEditor, TimingEditor, T],
  template: `
    <main class="page narrow-page">
      <section class="card stack">
        <h1>{{ 'Settings' | t }}</h1>
        <h2>{{ 'Language' | t }}</h2>
        <label>
          {{ 'Language for devices that join' | t }}
          <select class="lang-select" name="lang" [value]="queueLang()" (change)="setLang($event)">
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
          </select>
        </label>
        <p class="hint">
          {{ 'Customer screens and the order follow page always use this language. Staff can still switch their own device with NL / EN at the top.' | t }}
        </p>
        <h2>{{ 'Menu' | t }}</h2>
        <p class="hint">{{ 'Changes apply to new orders. Orders already placed keep their colors.' | t }}</p>
        <app-menu-editor [(menu)]="menu" [defaultPrice]="timing().price" />
        <h2>{{ 'Pizzas and ready times' | t }}</h2>
        @if (sold(); as s) {
          <p class="hint">
            {{ 'Sold so far:' | t }} <strong>{{ s.sold }}</strong>
            @if (s.left !== null) {
              · {{ 'still available:' | t }} <strong>{{ s.left }}</strong>
            }
          </p>
        }
        <app-timing-editor [(timing)]="timing" />
        @if (live(); as l) {
          <p class="hint">
            {{
              (l.slots === 1
                ? 'Used right now: prepare {prepare} min per pizza, bake {bake} min, counter {counter} min, with room for {slots} pizza in the oven at once.'
                : 'Used right now: prepare {prepare} min per pizza, bake {bake} min, counter {counter} min, with room for {slots} pizzas in the oven at once.'
              ) | t: { prepare: l.prepare, bake: l.bake, counter: l.counter, slots: l.slots }
            }}
          </p>
        }
        <div class="toolbar">
          <button class="btn primary" type="button" (click)="save()" [disabled]="!dirty()">
            {{ 'Save settings' | t }}
          </button>
          @if (saved()) {
            <span class="muted">{{ 'Saved.' | t }}</span>
          }
        </div>
      </section>
    </main>
  `,
})
export class MenuPage {
  protected queue = inject(QueueService);
  protected menu = signal<MenuItem[]>([]);
  protected timing = signal<Timing>({ ...DEFAULT_TIMING });
  protected saved = signal(false);
  /** The queue's settings as last loaded into the editor (or saved from it). */
  private base = signal<string | null>(null);
  /**
   * Whether the settings here were edited. Computed, not kept in step by an effect, so a
   * change arriving from another device right after a tap can't undo the tap.
   */
  protected dirty = computed(() => {
    const base = this.base();
    return base !== null && base !== settingsJson(this.menu(), this.timing());
  });
  /** The phase times the estimates use right now, in minutes. */
  protected live = computed(() => {
    const state = this.queue.state();
    if (!state) return null;
    const t = phaseTimes(state, this.queue.now());
    const min = (ms: number) => Math.round((ms / 60000) * 10) / 10;
    return {
      prepare: min(t.prepare),
      bake: min(t.bake),
      counter: min(t.counter),
      slots: state.timing.ovens * state.timing.pizzasPerOven,
    };
  });

  protected queueLang = computed<Lang>(() => this.queue.state()?.lang ?? 'nl');
  protected setLang(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (isLang(value)) this.queue.setLang(value);
  }

  protected sold = computed(() => {
    const state = this.queue.state();
    return state ? { sold: pizzasSold(state), left: pizzasLeft(state) } : null;
  });

  constructor() {
    // Load the queue's settings once available, and follow changes from other devices
    // unless they're being edited here.
    // Right away too: effects run after the first render, and an edit made before then
    // would be overwritten.
    this.load(this.queue.state());
    effect(() => {
      const state = this.queue.state();
      if (!untracked(this.dirty)) untracked(() => this.load(state));
    });
  }

  private load(state: QueueState | null) {
    if (!state) return;
    this.menu.set(state.menu);
    this.timing.set(state.timing);
    this.base.set(settingsJson(state.menu, state.timing));
  }

  save() {
    this.queue.setMenu(this.menu());
    this.queue.setTiming(this.timing());
    this.base.set(settingsJson(this.menu(), this.timing()));
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}

function settingsJson(menu: MenuItem[], timing: Timing): string {
  return JSON.stringify({ menu, timing });
}
