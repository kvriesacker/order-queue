import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil, pizzaSummary } from '../estimate';
import { DisplayStage, Order, pizzaStage } from '../models';
import { T, speakToCustomers, t } from '../i18n/i18n';

const COLUMNS: { stage: DisplayStage; title: string; empty: string }[] = [
  { stage: 'ordered', title: 'Ordered', empty: 'No new orders.' },
  { stage: 'preparing', title: 'Being prepared', empty: 'Nothing being prepared.' },
  { stage: 'baking', title: 'In the oven', empty: 'Nothing in the oven.' },
  { stage: 'baked', title: 'Baked', empty: 'Nothing waiting to be handed out.' },
  { stage: 'ready', title: 'Ready! Please collect', empty: '' },
];

/**
 * Customer-facing screen: pizzas in five blocks (ordered, being prepared, in the oven, baked,
 * ready), grouped per order with the customer's name and the estimated time until it's ready.
 * Each pizza is where it is, so one order can show in several blocks at once.
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
              <li
                [class.fresh]="col.stage === 'ready' && p.number === freshest()"
                [class.partly]="p.partly"
              >
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
   * Each open order's pizzas per block, and how many the customer already has, so a big order
   * can be partly ready, partly in the oven and partly still to be made.
   */
  private parts = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status !== 'collected' && o.status !== 'cancelled')
      .map((o) => {
        const byStage = new Map<DisplayStage, string[]>();
        let handed = 0;
        o.items.forEach((item, i) =>
          item.units.forEach((_, u) => {
            const stage = pizzaStage(o, i, u);
            if (item.times[u]?.handed) handed++;
            else if (stage) byStage.set(stage, [...(byStage.get(stage) ?? []), item.name]);
          }),
        );
        return { order: o, byStage, handed };
      }),
  );
  protected readyOrders = computed(() =>
    this.parts()
      .filter((p) => p.byStage.has('ready'))
      .sort((a, b) => b.order.updatedAt - a.order.updatedAt),
  );
  /** What's on the Ready block, to chime when something new is ready. */
  protected ready = computed(() =>
    this.readyOrders().map((p) => `${p.order.number}:${p.byStage.get('ready')!.length}`),
  );
  protected freshest = computed(() => this.readyOrders()[0]?.order.number);
  protected columns = computed(() => {
    const estimates = this.queue.estimates();
    return COLUMNS.map((c) => {
      const parts = c.stage === 'ready' ? this.readyOrders() : this.parts();
      const rows = parts
        .filter((p) => p.byStage.has(c.stage))
        .map((p) => {
          const elsewhere = [...p.byStage.keys()].some((s) => s !== c.stage);
          return {
            ...this.row(p.order, p.byStage.get(c.stage)!),
            eta: c.stage === 'ready' ? undefined : estimates.get(p.order.id),
            // Ready while more of the order is still coming: yellow instead of green.
            partly: c.stage === 'ready' && elsewhere,
            // Part of a big order: say so, and what's still coming or already given.
            part:
              c.stage === 'ready'
                ? elsewhere
                  ? t('Part of the order, the rest follows')
                  : p.handed
                    ? t('The rest was already handed over')
                    : ''
                : elsewhere || p.handed
                  ? t('Part of the order')
                  : '',
          };
        });
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
