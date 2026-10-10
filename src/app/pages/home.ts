import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QueueService } from '../queue.service';
import { QueueState } from '../models';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
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
        <button class="btn primary big" type="submit">Create queue</button>
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
  mine = hostedQueues();

  create() {
    this.go(this.queue.create(this.name));
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
