import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { OrderTrack, TrackAlert, trackAlert, trackCrypto } from '../tracking';
import { clockTime, minutesUntil } from '../estimate';

const STEPS = [
  { label: 'Ordered', done: ['new', 'in-progress', 'ready', 'ready-for-customer', 'collected'] },
  { label: 'Being made', done: ['in-progress', 'ready', 'ready-for-customer', 'collected'] },
  { label: 'Baked', done: ['ready', 'ready-for-customer', 'collected'] },
  { label: 'Ready to collect', done: ['ready-for-customer', 'collected'] },
];

/** A customer following their own order on their phone, opened from the QR code. */
@Component({
  selector: 'app-track',
  template: `
    <main class="track" [class.is-ready]="order()?.status === 'ready-for-customer'">
      @if (order(); as o) {
        <p class="track-shop">{{ o.shop }}</p>
        <p class="track-label">Your order</p>
        <p class="track-number">{{ o.number }}</p>
        @if (o.customer) {
          <p class="track-name">{{ o.customer }}</p>
        }
        <p class="track-pizzas">{{ o.pizzas }}</p>

        @switch (o.status) {
          @case ('ready-for-customer') {
            <p class="track-big">Ready! Please collect it at the counter.</p>
          }
          @case ('collected') {
            <p class="track-big">Picked up. Enjoy your pizza!</p>
          }
          @case ('cancelled') {
            <p class="track-big">This order was cancelled. Please ask at the counter.</p>
          }
          @default {
            @if (o.eta) {
              <p class="track-eta">
                Ready around <strong>{{ clock(o.eta) }}</strong>
                <span>{{ until(o.eta) }}</span>
              </p>
            }
          }
        }

        @if (alert() === 'baking' && o.status !== 'ready-for-customer' && o.status !== 'collected') {
          <p class="track-alert" role="status">Your pizza is in the oven!</p>
        }

        @if (o.status !== 'cancelled') {
          <ol class="track-steps">
            @for (s of steps; track s.label) {
              <li [class.done]="s.done.includes(o.status)">{{ s.label }}</li>
            }
          </ol>
        }
        @if (o.status !== 'ready-for-customer' && o.status !== 'collected' && o.status !== 'cancelled') {
          <div class="track-alerts">
            @switch (permission()) {
              @case ('granted') {
                <p>🔔 Alerts on: you get a message when your pizza goes in the oven and when it's ready.</p>
              }
              @case ('default') {
                <button class="btn primary" type="button" (click)="enableAlerts()">
                  Alert me when it's baking and ready
                </button>
              }
              @case ('denied') {
                <p class="muted">
                  Alerts are blocked for this site in your browser settings. This page still
                  buzzes and changes when your order is ready.
                </p>
              }
              @default {
                <p class="muted">
                  Keep this page open: it buzzes when your pizza is baking and when it's ready. On
                  an iPhone, add it to your Home Screen to get alerts.
                </p>
              }
            }
          </div>
        }
        <p class="track-foot muted">
          This page updates by itself.
          @if (!online()) {
            <span class="pill offline">Reconnecting…</span>
          }
        </p>
      } @else {
        <p class="track-big">{{ online() ? 'Looking up your order…' : 'Connecting…' }}</p>
        @if (slow()) {
          <p class="muted">
            Your order is still being taken. It shows up here as soon as it's sent to the
            kitchen.
          </p>
        }
      }
    </main>
  `,
})
export class Track {
  readonly order$ = input.required<string>({ alias: 'order' });
  protected order = signal<OrderTrack | null>(null);
  protected online = signal(false);
  protected slow = signal(false);
  protected steps = STEPS;
  protected clock = clockTime;
  private now = signal(Date.now());
  protected until = (t: number) => minutesUntil(t, this.now());

  private stop: (() => void) | null = null;
  private following = '';
  /** The last thing that happened worth telling, shown on the page too. */
  protected alert = signal<TrackAlert | null>(null);
  protected permission = signal<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  private audio: AudioContext | null = null;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 15000);
    const slow = setTimeout(() => this.slow.set(true), 8000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(slow);
      this.stop?.();
    });
    effect(() => this.follow(this.order$()));
    // Buzz the phone once when the order is ready to collect, even if it was opened just then.
    let buzzed = false;
    effect(() => {
      if (this.order()?.status === 'ready-for-customer' && !buzzed) {
        buzzed = true;
        navigator.vibrate?.([200, 100, 200]);
      }
    });
  }

  async enableAlerts() {
    // A sound needs a tap first on phones, so get it ready now.
    try {
      this.audio = new AudioContext();
    } catch {
      this.audio = null;
    }
    this.permission.set(await Notification.requestPermission());
  }

  private tell(alert: TrackAlert, track: OrderTrack) {
    this.alert.set(alert);
    navigator.vibrate?.(alert === 'ready' ? [300, 100, 300, 100, 300] : [200]);
    this.beep(alert === 'ready' ? 2 : 1);
    if (this.permission() !== 'granted') return;
    const title = alert === 'ready' ? `Order ${track.number} is ready!` : `Order ${track.number} is in the oven`;
    const body =
      alert === 'ready'
        ? 'Please collect it at the counter.'
        : track.eta
          ? `Ready around ${clockTime(track.eta)}.`
          : 'Almost there.';
    const options: NotificationOptions = { body, tag: `order-${this.order$()}`, icon: 'icons/icon-192.png' };
    // Through the service worker where there is one: phones only show notifications that way.
    const plain = () => void new Notification(title, options);
    navigator.serviceWorker?.getRegistration().then(
      (reg) => (reg ? reg.showNotification(title, options) : plain()),
      plain,
    ) ?? plain();
  }

  private beep(times: number) {
    const ctx = this.audio;
    if (!ctx) return;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.35;
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  }

  private async follow(orderId: string) {
    this.stop?.();
    this.stop = null;
    this.following = orderId;
    const crypto = await trackCrypto(orderId);
    const db = await firestore().catch(() => null);
    if (!db || orderId !== this.following) return;
    const id = crypto.topic.slice(crypto.topic.lastIndexOf('/') + 1);
    let inbox = Promise.resolve();
    this.stop = onSnapshot(
      doc(db, 'tracks', id),
      { includeMetadataChanges: true },
      (snap) => {
        this.online.set(!snap.metadata.fromCache);
        const data = snap.get('data');
        if (typeof data !== 'string') return;
        inbox = inbox.then(async () => {
          const track = await crypto.decrypt<OrderTrack>(data);
          if (!track || orderId !== this.following) return;
          if (JSON.stringify(track) === JSON.stringify(this.order())) return;
          const alert = trackAlert(this.order(), track);
          this.order.set(track);
          if (alert) this.tell(alert, track);
        });
      },
      () => this.online.set(false),
    );
  }
}
