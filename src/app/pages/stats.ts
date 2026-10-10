import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { QueueService } from '../queue.service';
import { BLOCK_MINUTES, queueStats, statsCsv } from '../stats';
import { clockTime } from '../estimate';

/** Totals and timings of everything ordered, to learn from for the next event. */
@Component({
  selector: 'app-stats',
  imports: [DecimalPipe, PercentPipe],
  template: `
    <main class="page stats">
      <div class="stats-head">
        <h1>Statistics</h1>
        <button class="btn" type="button" (click)="download()" [disabled]="!s().orders">
          Download CSV
        </button>
      </div>

      @if (!s().orders) {
        <p class="muted">No orders yet. Totals and timings appear here as orders come in.</p>
      } @else {
        <div class="tiles">
          <div class="tile">
            <span class="tile-label">Pizzas sold</span>
            <strong class="tile-value">{{ s().pizzas }}</strong>
            @if (s().maxPizzas) {
              <span class="muted">of {{ s().maxPizzas }} available</span>
            }
          </div>
          <div class="tile">
            <span class="tile-label">Orders</span>
            <strong class="tile-value">{{ s().orders }}</strong>
            <span class="muted">{{ s().pizzasPerOrder | number: '1.1-1' }} pizzas per order</span>
          </div>
          <div class="tile">
            <span class="tile-label">Average wait</span>
            <strong class="tile-value">{{
              s().wait.average === null ? '–' : (s().wait.average | number: '1.0-0') + ' min'
            }}</strong>
            <span class="muted">order placed until called</span>
          </div>
          <div class="tile">
            <span class="tile-label">Pace</span>
            <strong class="tile-value">{{
              s().pizzasPerHour === null ? '–' : (s().pizzasPerHour | number: '1.0-0')
            }}</strong>
            <span class="muted">pizzas per hour</span>
          </div>
          <div class="tile">
            <span class="tile-label">Cancelled</span>
            <strong class="tile-value">{{ s().cancelledOrders }}</strong>
            <span class="muted">{{ s().cancelledOrders === 1 ? 'order' : 'orders' }}, {{ s().cancelledPizzas }}
              {{ s().cancelledPizzas === 1 ? 'pizza' : 'pizzas' }}</span>
          </div>
          @if (s().soldOutAt; as t) {
            <div class="tile">
              <span class="tile-label">Sold out at</span>
              <strong class="tile-value">{{ clock(t) }}</strong>
              <span class="muted">first order {{ clock(s().firstOrder!) }}</span>
            </div>
          }
        </div>

        @if (tips().length) {
          <section class="card stack">
            <h2>For next time</h2>
            <ul class="tips">
              @for (tip of tips(); track tip) {
                <li>{{ tip }}</li>
              }
            </ul>
          </section>
        }

        <div class="stats-grid">
          <section class="card stack">
            <h2>Pizzas per type</h2>
            <ol class="bars">
              @for (p of s().perPizza; track p.name) {
                <li [title]="p.name + ': ' + p.count + ' pizzas'">
                  <span class="bar-label"
                    ><span class="swatch" [style.background]="p.color"></span>{{ p.name }}</span
                  >
                  <span class="bar-track"
                    ><span
                      class="bar-fill"
                      [style.width.%]="(p.count / topPizza()) * 100"
                      [style.background]="p.color"
                    ></span
                  ></span>
                  <span class="bar-value"
                    >{{ p.count }} <small>{{ p.share | percent }}</small></span
                  >
                </li>
              }
            </ol>
          </section>

          <section class="card stack">
            <h2>Busiest times</h2>
            <p class="hint">Pizzas ordered per {{ block }} minutes.</p>
            <ol class="bars">
              @for (b of s().blocks; track b.start) {
                <li
                  [class.peak]="b.start === s().busiest?.start"
                  [title]="b.pizzas + ' pizzas in ' + b.orders + ' orders'"
                >
                  <span class="bar-label">{{ clock(b.start) }}</span>
                  <span class="bar-track"
                    ><span class="bar-fill" [style.width.%]="(b.pizzas / topBlock()) * 100"></span
                  ></span>
                  <span class="bar-value"
                    >{{ b.pizzas }} <small>{{ b.orders }} orders</small></span
                  >
                </li>
              }
            </ol>
          </section>

          <section class="card stack">
            <h2>How long things took</h2>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Your setting</th>
                  <th>Real average</th>
                  <th>Median</th>
                </tr>
              </thead>
              <tbody>
                @for (p of s().phases; track p.label) {
                  <tr>
                    <td>{{ p.label }}</td>
                    <td>{{ p.setting }} min</td>
                    <td>{{ p.average === null ? '–' : (p.average | number: '1.1-1') + ' min' }}</td>
                    <td>{{ p.median === null ? '–' : (p.median | number: '1.1-1') + ' min' }}</td>
                  </tr>
                }
                <tr class="total">
                  <td>Order placed until called</td>
                  <td></td>
                  <td>{{ s().wait.average === null ? '–' : (s().wait.average | number: '1.0-0') + ' min' }}</td>
                  <td>{{ s().wait.median === null ? '–' : (s().wait.median | number: '1.0-0') + ' min' }}</td>
                </tr>
              </tbody>
            </table>
            @if (s().wait.longest !== null) {
              <p class="hint">Longest wait: {{ s().wait.longest | number: '1.0-0' }} min.</p>
            }
          </section>

          <section class="card stack">
            <h2>Most asked for</h2>
            @if (s().notes.length) {
              <ol class="note-list">
                @for (n of s().notes; track n.note) {
                  <li>
                    <span>{{ n.note }}</span><strong>{{ n.count }}×</strong>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted">No notes on pizzas yet.</p>
            }
          </section>
        </div>
        @if (incomplete()) {
          <p class="hint">
            Some older picked-up orders were cleared before this device saw them, so the totals per
            type and time leave those out. The number of pizzas sold is complete.
          </p>
        }
      }
    </main>
  `,
})
export class Stats {
  protected queue = inject(QueueService);
  protected block = BLOCK_MINUTES;
  protected clock = clockTime;

  protected s = computed(() => {
    const state = this.queue.state();
    return state
      ? queueStats(state, this.queue.archive())
      : queueStats(EMPTY_STATE);
  });
  protected topPizza = computed(() => Math.max(1, ...this.s().perPizza.map((p) => p.count)));
  protected topBlock = computed(() => Math.max(1, ...this.s().blocks.map((b) => b.pizzas)));
  protected incomplete = computed(() => {
    const state = this.queue.state();
    if (!state?.soldCleared) return false;
    const archived = this.queue
      .archive()
      .filter((o) => o.status === 'collected')
      .reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0);
    return archived < state.soldCleared;
  });

  /** Plain-language lessons from the numbers. */
  protected tips = computed(() => {
    const s = this.s();
    const state = this.queue.state();
    const tips: string[] = [];
    if (!state || !s.orders) return tips;
    if (s.soldOutAt) {
      tips.push(
        `You sold out at ${clockTime(s.soldOutAt)}. If people kept coming, plan more than ${s.maxPizzas} pizzas.`,
      );
    } else if (s.maxPizzas && s.pizzas < s.maxPizzas) {
      tips.push(`${s.maxPizzas - s.pizzas} of the ${s.maxPizzas} pizzas you planned weren't sold.`);
    }
    const top = s.perPizza[0];
    if (top && s.perPizza.length > 1)
      tips.push(`${top.name} was the favourite: ${Math.round(top.share * 100)}% of all pizzas.`);
    const rare = s.perPizza.filter((p) => p.share < 0.05).map((p) => p.name);
    if (rare.length && s.pizzas >= 20) tips.push(`Hardly ordered: ${rare.join(', ')}.`);
    const unsold = state.menu
      .filter((m) => m.enabled && !s.perPizza.some((p) => p.name === m.name))
      .map((m) => m.name);
    if (unsold.length && s.pizzas >= 20) tips.push(`Never ordered: ${unsold.join(', ')}.`);
    if (s.busiest && s.blocks.length > 1)
      tips.push(
        `Busiest moment: ${clockTime(s.busiest.start)} to ${clockTime(s.busiest.start + BLOCK_MINUTES * 60000)}, with ${s.busiest.pizzas} pizzas. Have extra hands ready then.`,
      );
    for (const p of s.phases) {
      if (p.median === null || p.samples < 5) continue;
      const diff = p.median - p.setting;
      if (Math.abs(diff) >= Math.max(0.5, p.setting * 0.2)) {
        const step = p.label.split(' ')[0].toLowerCase();
        tips.push(
          `${p.label.split(' ')[0]} took about ${round(p.median)} min, you set ${p.setting}. Set ${step} to ${round(p.median)} min next time for better estimates.`,
        );
      }
    }
    return tips;
  });

  download() {
    const state = this.queue.state();
    if (!state) return;
    // The byte order mark makes Excel read names with accents correctly.
    const blob = new Blob(['﻿' + statsCsv(state, this.queue.archive())], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const day = new Date().toISOString().slice(0, 10);
    a.download = `${state.name.replace(/[^\w-]+/g, '-')}-${day}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function round(minutes: number): number {
  return Math.round(minutes * 2) / 2;
}

const EMPTY_STATE = {
  id: '',
  name: '',
  nextNumber: 1,
  menu: [],
  timing: { prepareMinutes: 3, bakeMinutes: 8, counterMinutes: 2, ovens: 1, pizzasPerOven: 4, maxPizzas: 0 },
  orders: [],
  soldCleared: 0,
  hostEpoch: 0,
  hostId: '',
};
