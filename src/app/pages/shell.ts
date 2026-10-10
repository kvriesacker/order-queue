import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
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
        <a routerLink="oven" routerLinkActive="active">Oven</a>
        <a routerLink="counter" routerLinkActive="active">Counter</a>
        <a routerLink="stats" routerLinkActive="active">Stats</a>
        @if (queue.isHost()) {
          <a routerLink="menu" routerLinkActive="active">Settings</a>
        }
      </nav>
      <div class="topbar-end">
        @if (queue.pizzasLeft(); as left) {
          <span class="pill left" [class.low]="left <= 10">{{ left }} {{ left === 1 ? 'pizza' : 'pizzas' }} left</span>
        } @else if (queue.pizzasLeft() === 0) {
          <span class="pill left low">Sold out</span>
        }
        <span class="pill" [class]="pill().kind">{{ pill().text }}</span>
        <button class="btn" type="button" (click)="share()">
          {{ copied() ? 'Link copied' : 'Share link' }}
        </button>
      </div>
    </header>
    @if (queue.connection() === 'offline') {
      <p class="banner">No internet connection. Changes are sent when it’s back.</p>
    } @else if (
      queue.connection() === 'online' && !queue.isHost() && queue.hostOnline() === false
    ) {
      <div class="banner takeover">
        @if (queue.takingOver()) {
          <span>Taking over as host…</span>
        } @else {
          <span
            >The queue’s host is offline. New orders and changes wait until its tab is open again,
            or until this device takes over.</span
          >
          @if (queue.state()) {
            <button class="btn primary small" type="button" (click)="takeOver()">Become host</button>
          }
        }
      </div>
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

  async takeOver() {
    const ok = confirm(
      'Only do this if the host’s device is really gone. This device then holds the queue: keep this tab open.',
    );
    if (ok && !(await this.queue.takeOver())) {
      alert('The host came back or another device took over first. Nothing changed here.');
    }
  }

  protected pill = computed(() => {
    const q = this.queue;
    if (q.connection() === 'offline') return { kind: 'offline', text: 'Offline' };
    if (q.connection() !== 'online') return { kind: 'connecting', text: 'Connecting…' };
    if (q.isHost()) {
      const n = q.guestCount();
      return { kind: 'online', text: `Hosting · ${n} ${n === 1 ? 'device' : 'devices'}` };
    }
    return q.hostOnline() === false
      ? { kind: 'offline', text: 'Host offline' }
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
