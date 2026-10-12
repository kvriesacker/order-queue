import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { renderSVG } from 'uqr';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { QueueService } from '../queue.service';
import { T, t } from '../i18n/i18n';
import { LangSwitch } from '../i18n/lang-switch';
import { focusMode } from '../focus';

import { Unlock } from './unlock';
@Component({
  selector: 'app-shell',
  imports: [Unlock, RouterOutlet, RouterLink, RouterLinkActive, T, LangSwitch],
  template: `
    @if (queue.lock() !== 'open') {
      <app-unlock />
    } @else {
    @if (!focus()) {
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
        <button class="btn" type="button" aria-haspopup="dialog" (click)="openShare()">
          {{ 'Share link' | t }}
        </button>
        <app-lang-switch />
      </div>
    </header>
    }
    @if (queue.connection() === 'offline') {
      <p class="banner">{{ 'No internet connection. Changes are sent when it’s back.' | t }}</p>
    } @else if (queue.connection() === 'no-backend') {
      <p class="banner">
        {{ 'This app isn’t connected to its Firebase project yet, so changes stay on this device.' | t }}
      </p>
    }
    <router-outlet />
    <dialog #shareDialog class="share-dialog" aria-labelledby="share-title" (close)="sharing.set(false)">
      @if (sharing()) {
        <h2 id="share-title">{{ 'Invite your team' | t }}</h2>
        <p class="muted">{{ 'Scan this code with another phone or tablet to work along in this queue.' | t }}</p>
        <div class="qr share-qr" [innerHTML]="qr()"></div>
        <p class="share-link">{{ link() }}</p>
        @if (queue.queuePassword(); as password) {
          <p class="share-password">
            {{ 'They also need the queue password:' | t }}
            @if (showPassword()) {
              <strong>{{ password }}</strong>
            } @else {
              <button class="btn ghost small" type="button" (click)="showPassword.set(true)">
                {{ 'Show password' | t }}
              </button>
            }
          </p>
        }
        <div class="share-actions">
          <button class="btn primary big" type="button" (click)="copy()">
            {{ (copied() ? '✓ Link copied' : 'Copy link') | t }}
          </button>
          @if (canShare) {
            <button class="btn" type="button" (click)="share()">{{ 'Send…' | t }}</button>
          }
          <button class="btn ghost" type="button" (click)="shareDialog.close()">{{ 'Close' | t }}</button>
        </div>
      }
    </dialog>
    }
  `,
})
export class Shell {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected copied = signal(false);
  protected sharing = signal(false);
  protected showPassword = signal(false);
  private shareDialog = viewChild.required<ElementRef<HTMLDialogElement>>('shareDialog');
  protected canShare = typeof navigator !== 'undefined' && !!navigator.share;
  protected link = computed(() => this.queue.shareLink(this.queue.state()?.id));
  /** Our own SVG made from our own link, so it's safe to insert. */
  protected qr = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(renderSVG(this.link(), { border: 2 })),
  );
  private sanitizer = inject(DomSanitizer);
  protected focus = focusMode;

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

  /** Shows the queue link as a QR code for other staff to scan, with a button to copy it. */
  protected openShare() {
    this.copied.set(false);
    this.showPassword.set(false);
    this.sharing.set(true);
    this.shareDialog().nativeElement.showModal();
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.link());
    } catch {
      prompt(t('Copy this link'), this.link());
      return;
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /** The phone's own share sheet (WhatsApp, mail, …), where there is one. */
  async share() {
    const data = { title: t('Pizza queue'), text: t('Join our pizza order queue'), url: this.link() };
    try {
      await navigator.share(data);
    } catch {
      // Cancelled: the dialog stays open to copy the link instead.
    }
  }
}
