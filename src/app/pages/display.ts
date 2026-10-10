import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';

/**
 * Customer-facing screen: each order being made with the customer's name, its pizzas and
 * estimated time, and big numbers for orders ready to collect.
 */
@Component({
  selector: 'app-display',
  imports: [RouterLink],
  template: `
    <main class="display" (dblclick)="fullscreen()">
      <section class="display-col preparing">
        <h2>Preparing</h2>
        <ol class="prep-list">
          @for (p of preparing(); track p.number) {
            <li>
              <span class="prep-num">{{ p.number }}</span>
              <span class="prep-who">
                <strong>{{ p.name || 'Order ' + p.number }}</strong>
                <span class="prep-pizzas">{{ p.pizzas }}</span>
              </span>
              @if (p.eta) {
                <span class="prep-eta"
                  >{{ clock(p.eta) }}<small>{{ until(p.eta) }}</small></span
                >
              }
            </li>
          } @empty {
            <li class="prep-empty">No orders waiting.</li>
          }
        </ol>
      </section>
      <section class="display-col ready">
        <h2>Ready! Please collect</h2>
        <div class="numbers">
          @for (o of readyOrders(); track o.id) {
            <span class="called" [class.fresh]="o.number === freshest()"
              >{{ o.number }}
              @if (o.customer) {
                <small>{{ o.customer }}</small>
              }
              <small class="called-pizzas">{{ summary(o) }}</small>
            </span>
          }
        </div>
      </section>
      <footer class="display-footer">
        <span
          >{{ queue.state()?.name }}
          @if (queue.pizzasLeft() === 0) {
            <span class="pill left low">Sold out</span>
          }
        </span>
        <span class="display-controls">
          @if (queue.connection() !== 'online') {
            <span class="pill offline">Offline</span>
          }
          <button type="button" (click)="toggleSound()">
            {{ sound() ? '🔔 Sound on' : '🔕 Sound off' }}
          </button>
          <button type="button" (click)="fullscreen()">Full screen</button>
          <a routerLink="../counter">Back</a>
        </span>
      </footer>
    </main>
  `,
})
export class Display {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected sound = signal(true);
  protected clock = clockTime;
  protected summary = pizzaSummary;
  protected until = (t: number) => minutesUntil(t, this.queue.now());

  protected readyOrders = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'ready-for-customer')
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
  protected ready = computed(() => this.readyOrders().map((o) => o.number));
  protected freshest = computed(() => this.ready()[0]);
  protected preparing = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress' || o.status === 'ready')
      .map((o) => ({
        number: o.number,
        name: o.customer,
        pizzas: pizzaSummary(o),
        eta: this.queue.estimates().get(o.id),
      })),
  );

  private seen = new Set<number>();
  private primed = false;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
    // Chime when a new number appears on the screen.
    effect(() => {
      const numbers = this.ready();
      const fresh = numbers.some((n) => !this.seen.has(n));
      numbers.forEach((n) => this.seen.add(n));
      if (fresh && this.primed && untracked(this.sound)) chime();
      this.primed = this.queue.state() !== null;
    });
  }

  toggleSound() {
    this.sound.update((s) => !s);
    if (this.sound()) chime();
  }

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

let audio: AudioContext | undefined;

function chime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.55);
    });
  } catch {
    // Audio not available.
  }
}
