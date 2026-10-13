import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QueueService } from '../queue.service';
import { DEFAULT_MENU, DEFAULT_TIMING, MenuItem, QueueState, TIMING_KEYS, Timing, cleanOrderNumber, cleanQuickNotes, DEFAULT_QUICK_NOTES } from '../models';
import { MenuEditor } from './menu-editor';
import { TimingEditor } from './timing-editor';
import { QuickNotesEditor } from './quick-notes-editor';
import { InstallApp } from './install-app';
import { T, dateLocale, lang, queueLang, t } from '../i18n/i18n';
import { LangSwitch } from '../i18n/lang-switch';

@Component({
  selector: 'app-home',
  imports: [FormsModule, MenuEditor, TimingEditor, QuickNotesEditor, InstallApp, T, LangSwitch],
  template: `
    <main class="home">
      <div class="home-lang"><app-lang-switch /></div>
      <h1 class="brand"><span aria-hidden="true">🍕</span> {{ 'Pizza queue' | t }}</h1>
      <p class="lead">{{ 'Take orders, bake them and call out the numbers, together on any device.' | t }}</p>
      <app-install />

      <form class="card stack" (ngSubmit)="create()">
        <h2>{{ 'Start a new queue' | t }}</h2>
        <label>
          {{ 'Shop name' | t }}
          <input name="name" [(ngModel)]="name" placeholder="Pizzeria Napoli" maxlength="40" />
        </label>
        <label>
          {{ 'First order number' | t }}
          <input
            name="firstNumber"
            type="number"
            min="1"
            max="999999"
            step="1"
            inputmode="numeric"
            [(ngModel)]="firstNumber"
          />
          <span class="hint">{{ 'The number on your first printed ticket. You can change it later when taking orders.' | t }}</span>
        </label>
        <div class="stack tight">
          <strong>{{ 'Pizzas on the menu' | t }}</strong>
          <span class="hint">{{ 'Untick what you don’t sell and pick a color for each pizza.' | t }}</span>
        </div>
        <app-menu-editor [(menu)]="menu" [defaultPrice]="timing().price" />
        <div class="stack tight">
          <strong>{{ 'Options per pizza' | t }}</strong>
          <span class="hint">{{ 'Quick picks for the note of each pizza when taking orders. Remove them all to keep only the free text note.' | t }}</span>
        </div>
        <app-quick-notes-editor [(notes)]="quickNotes" />
        <strong>{{ 'Pizzas and ready times' | t }}</strong>
        <app-timing-editor [(timing)]="timing" />
        <label>
          {{ 'Queue password' | t }}
          <input
            name="password"
            type="password"
            autocomplete="new-password"
            [(ngModel)]="password"
            minlength="4"
            maxlength="60"
          />
          <span class="hint">{{ 'Your team needs this password and the link to join. Customers never need it.' | t }}</span>
        </label>
        @if (createError()) {
          <p class="error">{{ createError() | t }}</p>
        }
        <button class="btn primary big" type="submit">{{ 'Start queue' | t }}</button>
      </form>

      <form class="card stack" (ngSubmit)="join()">
        <h2>{{ 'Join a queue' | t }}</h2>
        <label>
          {{ 'Link or code' | t }}
          <input name="code" [(ngModel)]="code" [placeholder]="'https://…#/q/abc123 or abc123' | t" />
        </label>
        <button class="btn big" type="submit" [disabled]="!code.trim()">{{ 'Join' | t }}</button>
        @if (joinError()) {
          <p class="error">{{ joinError() | t }}</p>
        }
      </form>

      @if (mine().length) {
        <section class="card stack">
          <h2>{{ 'Your queues' | t }}</h2>
          @for (q of mine(); track q.id) {
            <div class="queue-row">
              <button class="btn row-btn" type="button" (click)="go(q.id)">
                <span>{{ q.name }}</span>
                <span class="muted">{{ lastUsed(q) }} · {{ (q.orders.length === 1 ? '{n} order' : '{n} orders') | t: { n: q.orders.length } }}</span>
              </button>
              <button
                class="btn ghost small"
                type="button"
                [attr.aria-label]="'Remove {name}' | t: { name: q.name }"
                (click)="remove(q)"
              >
                {{ 'Remove' | t }}
              </button>
            </div>
          }
        </section>
      }
    </main>
  `,
})
export class Home {
  private queue = inject(QueueService);
  private router = inject(Router);

  name = '';
  password = '';
  /** Orders are numbered from here, to match tickets already printed (Koen). */
  firstNumber = 1;
  code = '';
  joinError = signal('');
  createError = signal('');
  menu = signal<MenuItem[]>(lastMenu());
  timing = signal<Timing>(lastTiming());
  quickNotes = signal<string[]>(lastQuickNotes());
  mine = signal(hostedQueues());

  create() {
    if (!this.menu().some((m) => m.enabled)) {
      this.createError.set('Tick at least one pizza.');
      return;
    }
    if (cleanOrderNumber(this.firstNumber) === null) {
      this.createError.set('The first order number must be a whole number from 1 to 999999.');
      return;
    }
    if (this.password.trim().length < 4) {
      this.createError.set('Choose a queue password of at least 4 characters.');
      return;
    }
    try {
      localStorage.setItem(LAST_MENU_KEY, JSON.stringify(this.menu()));
      localStorage.setItem(LAST_TIMING_KEY, JSON.stringify(this.timing()));
      localStorage.setItem(LAST_NOTES_KEY, JSON.stringify(this.quickNotes()));
    } catch {
      // Not remembering the menu is fine.
    }
    this.go(this.queue.create(this.name, this.menu(), this.timing(), lang(), this.password.trim(), this.firstNumber, this.quickNotes()));
  }

  join() {
    const match = this.code.trim().match(/(?:#\/q\/)?([a-z0-9]{4,12})\/?$/i);
    if (!match) {
      this.joinError.set('That doesn’t look like a queue link or code.');
      return;
    }
    this.go(match[1].toLowerCase());
  }

  /** When the queue last had an order, so old ones are easy to spot. */
  lastUsed(q: QueueState): string {
    const last = Math.max(0, ...q.orders.map((o) => o.updatedAt ?? o.createdAt));
    if (!last) return t('no orders yet');
    return new Date(last).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  }

  remove(q: QueueState) {
    const ok = confirm(
      t(
        'Remove “{name}” from this device? Its orders and statistics on this device are deleted. Download the statistics first if you still need them.',
        { name: q.name },
      ),
    );
    if (!ok) return;
    this.queue.forget(q.id);
    this.mine.set(hostedQueues());
  }

  go(id: string) {
    this.router.navigate(['/q', id]);
  }
}

const LAST_MENU_KEY = 'pizza-queue:last-menu';
const LAST_TIMING_KEY = 'pizza-queue:last-timing';
const LAST_NOTES_KEY = 'pizza-queue:last-quick-notes';

/** The quick picks of the last queue started here, or the standard ones in this language. */
function lastQuickNotes(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_NOTES_KEY) ?? 'null');
    if (Array.isArray(saved)) return cleanQuickNotes(saved);
  } catch {
    // Fall back to the standard ones.
  }
  return DEFAULT_QUICK_NOTES.map((n) => t(n));
}

function lastTiming(): Timing {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_TIMING_KEY) ?? 'null');
    if (TIMING_KEYS.every((k) => saved?.[k] > 0)) return { ...DEFAULT_TIMING, ...saved };
  } catch {
    // Fall back to the default timing.
  }
  return { ...DEFAULT_TIMING };
}

/** The menu used for the last queue made in this browser, or the default one. */
function lastMenu(): MenuItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_MENU_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    // Fall back to the default menu.
  }
  return DEFAULT_MENU.map((m) => ({ ...m }));
}

function hostedQueues(): QueueState[] {
  const result: QueueState[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Queues this browser hosts or helped with (staff devices keep a copy).
      if (!key?.startsWith('pizza-queue:host:') && !key?.startsWith('pizza-queue:copy:')) continue;
      const queue = JSON.parse(localStorage.getItem(key)!) as QueueState;
      if (!result.some((q) => q.id === queue.id)) result.push(queue);
    }
  } catch {
    // Storage unavailable; nothing to list.
  }
  // Most recently used first.
  const last = (q: QueueState) => Math.max(0, ...q.orders.map((o) => o.updatedAt ?? o.createdAt));
  return result.sort((a, b) => last(b) - last(a));
}
