import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';
import { DisplayStage, Order, displayStage } from '../models';

const COLUMNS: { stage: DisplayStage; title: string; empty: string }[] = [
  { stage: 'ordered', title: 'Ordered', empty: 'No new orders.' },
  { stage: 'preparing', title: 'Being prepared', empty: 'Nothing being prepared.' },
  { stage: 'baking', title: 'Baking', empty: 'Nothing in the oven.' },
  { stage: 'ready', title: 'Ready! Please collect', empty: '' },
];

/**
 * Customer-facing screen: orders in four blocks (ordered, being prepared, baking, ready), each
 * with the customer's name and pizzas, and the estimated time until it's ready.
 */
@Component({
  selector: 'app-display',
  imports: [RouterLink],
  template: `
    <main class="display" (dblclick)="fullscreen()">
      @for (col of columns(); track col.stage) {
        <section class="display-col" [class]="col.stage">
          <h2>{{ col.title }}</h2>
          <ol class="prep-list" [class.ready-list]="col.stage === 'ready'">
            @for (p of col.orders; track p.id) {
              <li [class.fresh]="col.stage === 'ready' && p.number === freshest()">
                <span class="prep-num">{{ p.number }}</span>
                <span class="prep-who">
                  <strong>{{ p.name || 'Order ' + p.number }}</strong>
                  <span class="prep-pizzas">{{ p.pizzas }}</span>
                </span>
                @if (col.stage !== 'ready' && p.eta) {
                  <span class="prep-eta"
                    >{{ clock(p.eta) }}<small>{{ until(p.eta) }}</small></span
                  >
                }
              </li>
            } @empty {
              @if (col.empty) {
                <li class="prep-empty">{{ col.empty }}</li>
              }
            }
          </ol>
        </section>
      }
      <footer class="display-footer">
        <span
          >{{ queue.state()?.name }}
          @if (queue.pizzasLeft() === 0) {
            <span class="pill left low">Sold out</span>
          }
        </span>
        <span class="display-controls">
          @if (queue.connection() === 'offline' || queue.connection() === 'no-backend') {
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
  protected columns = computed(() => {
    const estimates = this.queue.estimates();
    const row = (o: Order) => ({
      id: o.id,
      number: o.number,
      name: o.customer,
      pizzas: pizzaSummary(o),
      eta: estimates.get(o.id),
    });
    const inStage = (stage: DisplayStage) =>
      this.queue.orders().filter((o) => displayStage(o) === stage);
    return COLUMNS.map((c) => ({
      ...c,
      orders: (c.stage === 'ready' ? this.readyOrders() : inStage(c.stage)).map(row),
    }));
  });

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
