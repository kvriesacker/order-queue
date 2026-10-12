import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DEFAULT_TIMING, MenuItem, QueueState, Timing, pizzasLeft, pizzasSold } from '../models';
import { QueueService } from '../queue.service';
import { phaseTimes } from '../estimate';
import { MenuEditor } from './menu-editor';
import { TimingEditor } from './timing-editor';

/** Lets the staff change the menu and the starting time estimate while the queue runs. */
@Component({
  selector: 'app-menu-page',
  imports: [MenuEditor, TimingEditor],
  template: `
    <main class="page narrow-page">
      <section class="card stack">
        <h1>Settings</h1>
        <h2>Menu</h2>
        <p class="hint">Changes apply to new orders. Orders already placed keep their colors.</p>
        <app-menu-editor [(menu)]="menu" [defaultPrice]="timing().price" />
        <h2>Pizzas and ready times</h2>
        @if (sold(); as s) {
          <p class="hint">
            Sold so far: <strong>{{ s.sold }}</strong>
            @if (s.left !== null) {
              · still available: <strong>{{ s.left }}</strong>
            }
          </p>
        }
        <app-timing-editor [(timing)]="timing" />
        @if (live(); as l) {
          <p class="hint">
            Used right now: prepare {{ l.prepare }} min per pizza, bake {{ l.bake }} min, counter
            {{ l.counter }} min, with room for {{ l.slots }}
            {{ l.slots === 1 ? 'pizza' : 'pizzas' }} in the oven at once.
          </p>
        }
        <div class="toolbar">
          <button class="btn primary" type="button" (click)="save()" [disabled]="!dirty()">
            Save settings
          </button>
          @if (saved()) {
            <span class="muted">Saved.</span>
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
