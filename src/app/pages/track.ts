import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import mqtt, { type MqttClient } from 'mqtt';
import { brokerUrl } from '../queue.service';
import { OrderTrack, trackCrypto } from '../tracking';
import { clockTime, minutesUntil } from '../estimate';
import { randomId } from '../models';

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

        @if (o.status !== 'cancelled') {
          <ol class="track-steps">
            @for (s of steps; track s.label) {
              <li [class.done]="s.done.includes(o.status)">{{ s.label }}</li>
            }
          </ol>
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
            We can't find this order yet. It shows up as soon as the shop's screen is online.
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

  private client: MqttClient | null = null;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 15000);
    const slow = setTimeout(() => this.slow.set(true), 8000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(slow);
      this.client?.end(true);
    });
    effect(() => this.follow(this.order$()));
    // Buzz the phone once when the order is ready to collect.
    let buzzed = false;
    effect(() => {
      if (this.order()?.status === 'ready-for-customer' && !buzzed) {
        buzzed = true;
        navigator.vibrate?.([200, 100, 200]);
      }
    });
  }

  private async follow(orderId: string) {
    this.client?.end(true);
    const crypto = await trackCrypto(orderId);
    const topic = `${crypto.topic}/order`;
    const client = mqtt.connect(brokerUrl(), {
      clientId: `pq-${randomId(12)}`,
      clean: true,
      keepalive: 30,
      connectTimeout: 10000,
      reconnectPeriod: 2000,
    });
    this.client = client;
    let inbox = Promise.resolve();
    client.on('connect', () => {
      this.online.set(true);
      client.subscribe(topic, { qos: 1 });
    });
    client.on('offline', () => this.online.set(false));
    client.on('error', () => this.online.set(false));
    client.on('message', (_topic, payload) => {
      const text = payload.toString();
      inbox = inbox.then(async () => {
        if (!text) return;
        const track = await crypto.decrypt<OrderTrack>(text);
        if (track && client === this.client) this.order.set(track);
      });
    });
  }
}
