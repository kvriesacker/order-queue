import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DEFAULT_TIMING, MenuItem, Timing, pizzasLeft, pizzasSold } from '../models';
import { QueueService } from '../queue.service';
import { phaseTimes } from '../estimate';
import { MenuEditor } from './menu-editor';
import { TimingEditor } from './timing-editor';

/** Lets the host change the menu and the starting time estimate while the queue runs. */
@Component({
  selector: 'app-menu-page',
  imports: [MenuEditor, TimingEditor],
  template: `
    <main class="page narrow-page">
      <section class="card stack">
        <h1>Settings</h1>
        @if (queue.isHost()) {
          <h2>Menu</h2>
          <p class="hint">Changes apply to new orders. Orders already placed keep their colors.</p>
          <app-menu-editor [(menu)]="menu" />
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
        } @else {
          <p class="muted">Only the device that started the queue can change the settings.</p>
        }
      </section>
    </main>
  `,
})
export class MenuPage {
  protected queue = inject(QueueService);
  protected menu = signal<MenuItem[]>([]);
  protected timing = signal<Timing>({ ...DEFAULT_TIMING });
  protected saved = signal(false);
  protected dirty = signal(false);
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
    // Load the queue's settings once available, unless the host is editing.
    effect(() => {
      const state = this.queue.state();
      if (!state || untracked(this.dirty)) return;
      this.menu.set(state.menu);
      this.timing.set(state.timing);
    });
    effect(() => {
      const draft = { menu: this.menu(), timing: this.timing() };
      untracked(() => {
        const state = this.queue.state();
        // Until the queue has loaded there's nothing to compare with, so nothing is edited
        // yet; otherwise the queue's menu would never be loaded into the editor.
        const current = state && { menu: state.menu, timing: state.timing };
        this.dirty.set(!!current && JSON.stringify(current) !== JSON.stringify(draft));
      });
    });
  }

  save() {
    this.queue.setMenu(this.menu());
    this.queue.setTiming(this.timing());
    this.dirty.set(false);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
