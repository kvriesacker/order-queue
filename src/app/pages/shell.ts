import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { QueueService } from '../queue.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand small" routerLink="/"
        ><span aria-hidden="true">🍕</span> {{ queue.state()?.name ?? 'Pizza queue' }}</a
      >
      <nav class="tabs">
        <a routerLink="take" routerLinkActive="active">Orders</a>
        <a routerLink="kitchen" routerLinkActive="active">Kitchen</a>
        <a routerLink="counter" routerLinkActive="active">Counter</a>
      </nav>
      <div class="topbar-end">
        <span class="pill" [class]="queue.connection()" [title]="queue.lastError()">
          @switch (queue.connection()) {
            @case ('online') {
              {{ queue.isHost() ? 'Hosting · ' + queue.guestCount() + ' connected' : 'Connected' }}
            }
            @case ('offline') {
              Offline
            }
            @default {
              Connecting…
            }
          }
        </span>
        <button class="btn" type="button" (click)="share()">
          {{ copied() ? 'Link copied' : 'Share link' }}
        </button>
      </div>
    </header>
    @if (queue.lastError() && queue.connection() !== 'online') {
      <p class="banner">{{ queue.lastError() }}</p>
    }
    @if (queue.isHost()) {
      <p class="banner subtle">This tab holds the queue. Keep it open so others stay in sync.</p>
    }
    <router-outlet />
  `,
})
export class Shell {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected copied = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
  }

  async share() {
    const link = this.queue.shareLink();
    const data = { title: 'Pizza queue', text: 'Join our pizza order queue', url: link };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // Fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      prompt('Copy this link', link);
      return;
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
