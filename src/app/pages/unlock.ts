import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QueueService } from '../queue.service';
import { T } from '../i18n/i18n';

/**
 * Asks staff joining a queue for its password. Shown instead of the queue until it's right;
 * the device remembers it after that.
 */
@Component({
  selector: 'app-unlock',
  imports: [FormsModule, T],
  template: `
    <main class="unlock">
      <form class="card stack" (ngSubmit)="queue.unlock(password)">
        <h1><span aria-hidden="true">🔒</span> {{ 'This queue has a password' | t }}</h1>
        @if (queue.lock() === 'checking' && !tried) {
          <p class="muted">{{ 'Connecting…' | t }}</p>
        } @else {
          <p class="muted">{{ 'Ask whoever started the queue for the password.' | t }}</p>
          <label>
            {{ 'Queue password' | t }}
            <input
              name="password"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              (ngModelChange)="tried = true"
              autofocus
            />
          </label>
          @if (queue.lock() === 'wrong') {
            <p class="error" role="alert">{{ 'That password isn’t right. Try again.' | t }}</p>
          }
          <button class="btn primary big" type="submit" [disabled]="!password || queue.lock() === 'checking'">
            @if (queue.lock() === 'checking') {
              {{ 'Checking…' | t }}
            } @else {
              {{ 'Join' | t }}
            }
          </button>
        }
      </form>
    </main>
  `,
})
export class Unlock {
  protected queue = inject(QueueService);
  protected password = '';
  protected tried = false;
}
