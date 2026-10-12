import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DEFAULT_SPONSOR_SECONDS, DEFAULT_TIMING, MenuItem, QueueState, Sponsor, Timing, cleanSponsors, pizzasLeft,
  pizzasSold,
} from '../models';
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
        <h2>{{ 'Sponsors' | t }}</h2>
        <p class="hint">
          {{ 'The customer screens show these one after another, with an optional message. Leave the list empty to show none.' | t }}
        </p>
        <ul class="sponsor-editor">
          @for (s of sponsors(); track $index; let i = $index) {
            <li>
              <label>
                {{ 'Sponsor name' | t }}
                <input name="sponsor-name" [value]="s.name" (input)="editSponsor(i, 'name', $event)" maxlength="60" />
              </label>
              <label>
                {{ 'Message' | t }} <span class="muted">{{ '(optional)' | t }}</span>
                <input name="sponsor-message" [value]="s.message" (input)="editSponsor(i, 'message', $event)"
                  maxlength="140" />
              </label>
              <button class="btn ghost small" type="button" (click)="removeSponsor(i)"
                [attr.aria-label]="'Remove sponsor {n}' | t: { n: i + 1 }">
                {{ 'Remove' | t }}
              </button>
            </li>
          }
        </ul>
        <div class="toolbar">
          <button class="btn small" type="button" (click)="addSponsor()" [disabled]="sponsors().length >= 30">
            {{ '+ Add sponsor' | t }}
          </button>
        </div>
        <label class="sponsor-seconds">
          {{ 'Show each sponsor for (seconds)' | t }}
          <input type="number" name="sponsor-seconds" min="3" max="600" [value]="sponsorSeconds()"
            (input)="sponsorSeconds.set(+$any($event.target).value)" />
        </label>
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
  protected sponsors = signal<Sponsor[]>([]);
  protected sponsorSeconds = signal(DEFAULT_SPONSOR_SECONDS);
  /** The queue's settings as last loaded into the editor (or saved from it). */
  private base = signal<string | null>(null);
  /**
   * Whether the settings here were edited. Computed, not kept in step by an effect, so a
   * change arriving from another device right after a tap can't undo the tap.
   */
  protected dirty = computed(() => {
    const base = this.base();
    return base !== null && base !== this.json();
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
    this.sponsors.set(state.sponsors ?? []);
    this.sponsorSeconds.set(state.sponsorSeconds ?? DEFAULT_SPONSOR_SECONDS);
    this.base.set(this.json());
  }

  /** Everything this page edits, to tell whether it changed. */
  private json(): string {
    return JSON.stringify({
      menu: this.menu(),
      timing: this.timing(),
      sponsors: this.sponsors(),
      seconds: this.sponsorSeconds(),
    });
  }

  protected addSponsor() {
    this.sponsors.update((list) => [...list, { name: '', message: '' }]);
  }

  protected removeSponsor(index: number) {
    this.sponsors.update((list) => list.filter((_, i) => i !== index));
  }

  protected editSponsor(index: number, field: keyof Sponsor, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.sponsors.update((list) => list.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  save() {
    this.queue.setMenu(this.menu());
    this.queue.setTiming(this.timing());
    this.queue.setSponsors(cleanSponsors(this.sponsors()), this.sponsorSeconds());
    // Blank rows are dropped when saved.
    this.sponsors.set(cleanSponsors(this.sponsors()));
    this.base.set(this.json());
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
