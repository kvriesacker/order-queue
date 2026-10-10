import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QueueService } from '../queue.service';
import { DEFAULT_MENU, DEFAULT_TIMING, MenuItem, QueueState, TIMING_KEYS, Timing } from '../models';
import { MenuEditor } from './menu-editor';
import { TimingEditor } from './timing-editor';

@Component({
  selector: 'app-home',
  imports: [FormsModule, MenuEditor, TimingEditor],
  template: `
    <main class="home">
      <h1 class="brand"><span aria-hidden="true">🍕</span> Pizza queue</h1>
      <p class="lead">Take orders, bake them and call out the numbers, together on any device.</p>

      <form class="card stack" (ngSubmit)="create()">
        <h2>Start a new queue</h2>
        <label>
          Shop name
          <input name="name" [(ngModel)]="name" placeholder="Pizzeria Napoli" maxlength="40" />
        </label>
        <div class="stack tight">
          <strong>Pizzas on the menu</strong>
          <span class="hint">Untick what you don’t sell and pick a color for each pizza.</span>
        </div>
        <app-menu-editor [(menu)]="menu" />
        <strong>Pizzas and ready times</strong>
        <app-timing-editor [(timing)]="timing" />
        @if (createError()) {
          <p class="error">{{ createError() }}</p>
        }
        <button class="btn primary big" type="submit">Start queue</button>
        <p class="hint">
          Keep this browser tab open while the shop is running: it holds the orders.
        </p>
      </form>

      <form class="card stack" (ngSubmit)="join()">
        <h2>Join a queue</h2>
        <label>
          Link or code
          <input name="code" [(ngModel)]="code" placeholder="https://…#/q/abc123 or abc123" />
        </label>
        <button class="btn big" type="submit" [disabled]="!code.trim()">Join</button>
        @if (joinError()) {
          <p class="error">{{ joinError() }}</p>
        }
      </form>

      @if (mine.length) {
        <section class="card stack">
          <h2>Your queues</h2>
          @for (q of mine; track q.id) {
            <button class="btn row-btn" type="button" (click)="go(q.id)">
              <span>{{ q.name }}</span>
              <span class="muted">{{ q.id }} · {{ q.orders.length }} orders</span>
            </button>
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
  code = '';
  joinError = signal('');
  createError = signal('');
  menu = signal<MenuItem[]>(lastMenu());
  timing = signal<Timing>(lastTiming());
  mine = hostedQueues();

  create() {
    if (!this.menu().some((m) => m.enabled)) {
      this.createError.set('Tick at least one pizza.');
      return;
    }
    try {
      localStorage.setItem(LAST_MENU_KEY, JSON.stringify(this.menu()));
      localStorage.setItem(LAST_TIMING_KEY, JSON.stringify(this.timing()));
    } catch {
      // Not remembering the menu is fine.
    }
    this.go(this.queue.create(this.name, this.menu(), this.timing()));
  }

  join() {
    const match = this.code.trim().match(/(?:#\/q\/)?([a-z0-9]{4,12})\/?$/i);
    if (!match) {
      this.joinError.set('That doesn’t look like a queue link or code.');
      return;
    }
    this.go(match[1].toLowerCase());
  }

  go(id: string) {
    this.router.navigate(['/q', id]);
  }
}

const LAST_MENU_KEY = 'pizza-queue:last-menu';
const LAST_TIMING_KEY = 'pizza-queue:last-timing';

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
      if (key?.startsWith('pizza-queue:host:')) result.push(JSON.parse(localStorage.getItem(key)!));
    }
  } catch {
    // Storage unavailable; nothing to list.
  }
  return result;
}
