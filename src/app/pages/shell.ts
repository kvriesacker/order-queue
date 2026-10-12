import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { QueueService } from '../queue.service';
import { T, t } from '../i18n/i18n';
import { LangSwitch } from '../i18n/lang-switch';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, T, LangSwitch],
  template: `
    <header class="topbar">
      <a class="brand small" routerLink="/"
        ><span aria-hidden="true">🍕</span> {{ queue.state()?.name ?? ('Pizza queue' | t) }}</a
      >
      <nav class="tabs">
        <a routerLink="take" routerLinkActive="active">{{ 'Orders' | t }}</a>
        <a routerLink="kitchen" routerLinkActive="active">{{ 'Kitchen' | t }}</a>
        <a routerLink="oven" routerLinkActive="active">{{ 'Oven' | t }}</a>
        <a routerLink="counter" routerLinkActive="active">{{ 'Counter' | t }}</a>
        <a routerLink="stats" routerLinkActive="active">{{ 'Stats' | t }}</a>
        <a routerLink="menu" routerLinkActive="active">{{ 'Settings' | t }}</a>
      </nav>
      <div class="topbar-end">
        @if (queue.pizzasLeft(); as left) {
          <span class="pill left" [class.low]="left <= 10">{{ (left === 1 ? '{n} pizza left' : '{n} pizzas left') | t: { n: left } }}</span>
        } @else if (queue.pizzasLeft() === 0) {
          <span class="pill left low">{{ 'Sold out' | t }}</span>
        }
        <span class="pill" [class]="pill().kind">{{ pill().text | t }}</span>
        <button class="btn" type="button" (click)="share()">
          {{ (copied() ? 'Link copied' : 'Share link') | t }}
        </button>
        <app-lang-switch />
      </div>
    </header>
    @if (queue.connection() === 'offline') {
      <p class="banner">{{ 'No internet connection. Changes are sent when it’s back.' | t }}</p>
    } @else if (queue.connection() === 'no-backend') {
      <p class="banner">
        {{ 'This app isn’t connected to its Firebase project yet, so changes stay on this device.' | t }}
      </p>
    }
    <router-outlet />
  `,
})
export class Shell {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected copied = signal(false);

  protected pill = computed(() => {
    const q = this.queue;
    if (q.connection() === 'offline') return { kind: 'offline', text: 'Offline' };
    if (q.connection() === 'no-backend') return { kind: 'offline', text: 'Not connected' };
    if (q.connection() !== 'online') return { kind: 'connecting', text: 'Connecting…' };
    return q.unsent()
      ? { kind: 'connecting', text: 'Saving…' }
      : { kind: 'online', text: 'Connected' };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
  }

  async share() {
    const link = this.queue.shareLink();
    const data = { title: t('Pizza queue'), text: t('Join our pizza order queue'), url: link };
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
      prompt(t('Copy this link'), link);
      return;
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
