import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';
import { DisplayStage, Order, PizzaStatus, displayStage, pizzaCalled } from '../models';
import { T, speakToCustomers, t } from '../i18n/i18n';

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
import { Unlock } from './unlock';
@Component({
  selector: 'app-display',
  imports: [Unlock, RouterLink, T],
  template: `
    @if (queue.lock() !== 'open') {
      <app-unlock />
    } @else {
    <main class="display" (dblclick)="fullscreen()">
      @for (col of columns(); track col.stage) {
        <section class="display-col" [class]="col.stage">
          <h2>{{ col.title | t }}</h2>
          <ol class="prep-list" [class.ready-list]="col.stage === 'ready'">
            @for (p of col.orders; track p.id) {
              <li [class.fresh]="col.stage === 'ready' && p.number === freshest()">
                <span class="prep-num">{{ p.number }}</span>
                <span class="prep-who">
                  <strong>{{ p.name || ('Order {n}' | t: { n: p.number }) }}</strong>
                  <span class="prep-pizzas">{{ p.pizzas }}</span>
                  @if (p.part) {
                    <span class="prep-part">{{ p.part }}</span>
                  }
                </span>
                @if (col.stage !== 'ready' && p.eta) {
                  <span class="prep-eta"
                    >{{ clock(p.eta) }}<small>{{ until(p.eta) }}</small></span
                  >
                }
              </li>
            } @empty {
              @if (col.empty) {
                <li class="prep-empty">{{ col.empty | t }}</li>
              }
            }
          </ol>
        </section>
      }
      <footer class="display-footer">
        <span
          >{{ queue.state()?.name }}
          @if (queue.pizzasLeft() === 0) {
            <span class="pill left low">{{ 'Sold out' | t }}</span>
          }
        </span>
        <span class="display-controls">
          @if (queue.connection() === 'offline' || queue.connection() === 'no-backend') {
            <span class="pill offline">{{ 'Offline' | t }}</span>
          }
          <button type="button" (click)="toggleSound()">
            {{ (sound() ? '🔔 Sound on' : '🔕 Sound off') | t }}
          </button>
          <button type="button" (click)="fullscreen()">{{ 'Full screen' | t }}</button>
          <a routerLink="../counter">{{ 'Back' | t }}</a>
        </span>
      </footer>
    </main>
    }
  `,
})
export class Display {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected sound = signal(true);
  protected clock = clockTime;
  protected summary = pizzaSummary;
  protected until = (t: number) => minutesUntil(t, this.queue.now());

  /**
   * Each open order split in what's ready (on the customer screen), what the customer already
   * has, and the rest, so a big order can be partly ready.
   */
  private parts = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status !== 'collected' && o.status !== 'cancelled')
      .map((o) => {
        const ready: string[] = [];
        const rest: string[] = [];
        const restUnits: PizzaStatus[] = [];
        let handed = 0;
        o.items.forEach((item, i) =>
          item.units.forEach((unit, u) => {
            if (item.times[u]?.handed) handed++;
            else if (pizzaCalled(o, i, u)) ready.push(item.name);
            else {
              rest.push(item.name);
              restUnits.push(unit);
            }
          }),
        );
        // A partly ready order shows its rest where those pizzas are.
        const stage =
          ready.length || handed
            ? displayStage({ ...o, items: [{ ...o.items[0], units: restUnits }] })
            : displayStage(o);
        return { order: o, ready, rest, handed, stage };
      }),
  );
  protected readyOrders = computed(() =>
    this.parts()
      .filter((p) => p.ready.length)
      .sort((a, b) => b.order.updatedAt - a.order.updatedAt),
  );
  /** What's on the Ready block, to chime when something new is ready. */
  protected ready = computed(() => this.readyOrders().map((p) => `${p.order.number}:${p.ready.length}`));
  protected freshest = computed(() => this.readyOrders()[0]?.order.number);
  protected columns = computed(() => {
    const estimates = this.queue.estimates();
    return COLUMNS.map((c) => {
      const rows =
        c.stage === 'ready'
          ? this.readyOrders().map((p) => ({
              ...this.row(p.order, p.ready),
              // Part of a big order: say so, and what's still coming or already given.
              part: p.rest.length
                ? t('Part of the order, the rest follows')
                : p.handed
                  ? t('The rest was already handed over')
                  : '',
            }))
          : this.parts()
              .filter((p) => p.rest.length && p.order.status !== 'ready-for-customer')
              .filter((p) => p.stage === c.stage)
              .map((p) => ({
                ...this.row(p.order, p.rest),
                eta: estimates.get(p.order.id),
                part: p.ready.length || p.handed ? t('Rest of the order') : '',
              }));
      return { ...c, orders: rows };
    });
  });

  private row(o: Order, names: string[]) {
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    return {
      id: o.id,
      number: o.number,
      name: o.customer,
      pizzas: [...counts].map(([name, n]) => `${n}× ${name}`).join(', '),
      eta: undefined as number | undefined,
      part: '',
    };
  }

  private seen = new Set<string>();
  private primed = false;

  constructor() {
    // Customers read this screen: it speaks the queue's language.
    speakToCustomers(() => this.queue.state()?.lang);
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
