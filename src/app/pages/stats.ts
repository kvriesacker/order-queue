import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { QueueService } from '../queue.service';
import { BLOCK_MINUTES, queueStats, statsCsv } from '../stats';
import { clockTime } from '../estimate';
import { formatPrice } from '../models';
import { T, t } from '../i18n/i18n';

/** Totals and timings of everything ordered, to learn from for the next event. */
@Component({
  selector: 'app-stats',
  imports: [DecimalPipe, PercentPipe, T],
  template: `
    <main class="page stats">
      <div class="stats-head">
        <h1>{{ 'Statistics' | t }}</h1>
        <button class="btn" type="button" (click)="download()" [disabled]="!s().orders">
          {{ 'Download CSV' | t }}
        </button>
      </div>

      @if (!s().orders) {
        <p class="muted">{{ 'No orders yet. Totals and timings appear here as orders come in.' | t }}</p>
      } @else {
        <div class="tiles">
          <div class="tile">
            <span class="tile-label">{{ 'Pizzas sold' | t }}</span>
            <strong class="tile-value">{{ s().pizzas }}</strong>
            @if (s().maxPizzas) {
              <span class="muted">{{ 'of {n} available' | t: { n: s().maxPizzas } }}</span>
            }
          </div>
          @if (s().revenue) {
            <div class="tile">
              <span class="tile-label">{{ 'Revenue' | t }}</span>
              <strong class="tile-value">{{ price(s().revenue) }}</strong>
              <span class="muted">{{ '{price} per order' | t: { price: price(s().revenue / (s().orders || 1)) } }}</span>
            </div>
          }
          <div class="tile">
            <span class="tile-label">{{ 'Orders' | t }}</span>
            <strong class="tile-value">{{ s().orders }}</strong>
            <span class="muted">{{ '{n} pizzas per order' | t: { n: (s().pizzasPerOrder | number: '1.1-1') ?? '' } }}</span>
          </div>
          <div class="tile">
            <span class="tile-label">{{ 'Average wait' | t }}</span>
            <strong class="tile-value">{{
              s().wait.average === null ? '–' : ('{n} min' | t: { n: (s().wait.average | number: '1.0-0') ?? '' })
            }}</strong>
            <span class="muted">{{ 'order placed until called' | t }}</span>
          </div>
          <div class="tile">
            <span class="tile-label">{{ 'Pace' | t }}</span>
            <strong class="tile-value">{{
              s().pizzasPerHour === null ? '–' : (s().pizzasPerHour | number: '1.0-0')
            }}</strong>
            <span class="muted">{{ 'pizzas per hour' | t }}</span>
          </div>
          <div class="tile">
            <span class="tile-label">{{ 'Cancelled' | t }}</span>
            <strong class="tile-value">{{ s().cancelledOrders }}</strong>
            <span class="muted">{{ (s().cancelledOrders === 1 ? 'order' : 'orders') | t }},
              {{ (s().cancelledPizzas === 1 ? '{n} pizza' : '{n} pizzas') | t: { n: s().cancelledPizzas } }}</span>
          </div>
          @if (s().soldOutAt; as soldAt) {
            <div class="tile">
              <span class="tile-label">{{ 'Sold out at' | t }}</span>
              <strong class="tile-value">{{ clock(soldAt) }}</strong>
              <span class="muted">{{ 'first order {time}' | t: { time: clock(s().firstOrder!) } }}</span>
            </div>
          }
        </div>

        @if (tips().length) {
          <section class="card stack">
            <h2>{{ 'For next time' | t }}</h2>
            <ul class="tips">
              @for (tip of tips(); track tip) {
                <li>{{ tip }}</li>
              }
            </ul>
          </section>
        }

        <div class="stats-grid">
          <section class="card stack">
            <h2>{{ 'Pizzas per type' | t }}</h2>
            <ol class="bars">
              @for (p of s().perPizza; track p.name) {
                <li [title]="'{name}: {n} pizzas' | t: { name: p.name, n: p.count }">
                  <span class="bar-label"
                    ><span class="legend-swatch" [style.background]="p.color"></span>{{ p.name }}</span
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
            <h2>{{ 'Busiest times' | t }}</h2>
            <p class="hint">{{ 'Pizzas ordered per {n} minutes.' | t: { n: block } }}</p>
            <ol class="bars">
              @for (b of s().blocks; track b.start) {
                <li
                  [class.peak]="b.start === s().busiest?.start"
                  [title]="'{pizzas} pizzas in {orders} orders' | t: { pizzas: b.pizzas, orders: b.orders }"
                >
                  <span class="bar-label">{{ clock(b.start) }}</span>
                  <span class="bar-track"
                    ><span class="bar-fill" [style.width.%]="(b.pizzas / topBlock()) * 100"></span
                  ></span>
                  <span class="bar-value"
                    >{{ b.pizzas }} <small>{{ (b.orders === 1 ? '{n} order' : '{n} orders') | t: { n: b.orders } }}</small></span
                  >
                </li>
              }
            </ol>
          </section>

          <section class="card stack">
            <h2>{{ 'How long things took' | t }}</h2>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>{{ 'Step' | t }}</th>
                  <th>{{ 'Your setting' | t }}</th>
                  <th>{{ 'Real average' | t }}</th>
                  <th>{{ 'Median' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (p of s().phases; track p.step) {
                  <tr>
                    <td>{{ p.label }}</td>
                    <td>{{ '{n} min' | t: { n: p.setting } }}</td>
                    <td>{{ p.average === null ? '–' : ('{n} min' | t: { n: (p.average | number: '1.1-1') ?? '' }) }}</td>
                    <td>{{ p.median === null ? '–' : ('{n} min' | t: { n: (p.median | number: '1.1-1') ?? '' }) }}</td>
                  </tr>
                }
                <tr class="total">
                  <td>{{ 'Order placed until called' | t }}</td>
                  <td></td>
                  <td>{{ s().wait.average === null ? '–' : ('{n} min' | t: { n: (s().wait.average | number: '1.0-0') ?? '' }) }}</td>
                  <td>{{ s().wait.median === null ? '–' : ('{n} min' | t: { n: (s().wait.median | number: '1.0-0') ?? '' }) }}</td>
                </tr>
              </tbody>
            </table>
            @if (s().wait.longest !== null) {
              <p class="hint">{{ 'Longest wait: {n} min.' | t: { n: (s().wait.longest | number: '1.0-0') ?? '' } }}</p>
            }
          </section>

          <section class="card stack">
            <h2>{{ 'Most asked for' | t }}</h2>
            @if (s().notes.length) {
              <ol class="note-list">
                @for (n of s().notes; track n.note) {
                  <li>
                    <span>{{ n.note }}</span><strong>{{ n.count }}×</strong>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted">{{ 'No notes on pizzas yet.' | t }}</p>
            }
          </section>
        </div>
        @if (incomplete()) {
          <p class="hint">
            {{
              'Some older picked-up orders were cleared before this device saw them, so the totals per type and time leave those out. The number of pizzas sold is complete.'
                | t
            }}
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
  protected price = formatPrice;

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
        t('You sold out at {time}. If people kept coming, plan more than {n} pizzas.', {
          time: clockTime(s.soldOutAt),
          n: s.maxPizzas,
        }),
      );
    } else if (s.maxPizzas && s.pizzas < s.maxPizzas) {
      tips.push(
        t("{n} of the {max} pizzas you planned weren't sold.", { n: s.maxPizzas - s.pizzas, max: s.maxPizzas }),
      );
    }
    const top = s.perPizza[0];
    if (top && s.perPizza.length > 1)
      tips.push(
        t('{name} was the favourite: {pct}% of all pizzas.', { name: top.name, pct: Math.round(top.share * 100) }),
      );
    const rare = s.perPizza.filter((p) => p.share < 0.05).map((p) => p.name);
    if (rare.length && s.pizzas >= 20) tips.push(t('Hardly ordered: {names}.', { names: rare.join(', ') }));
    const unsold = state.menu
      .filter((m) => m.enabled && !s.perPizza.some((p) => p.name === m.name))
      .map((m) => m.name);
    if (unsold.length && s.pizzas >= 20) tips.push(t('Never ordered: {names}.', { names: unsold.join(', ') }));
    if (s.busiest && s.blocks.length > 1)
      tips.push(
        t('Busiest moment: {from} to {to}, with {n} pizzas. Have extra hands ready then.', {
          from: clockTime(s.busiest.start),
          to: clockTime(s.busiest.start + BLOCK_MINUTES * 60000),
          n: s.busiest.pizzas,
        }),
      );
    for (const p of s.phases) {
      if (p.median === null || p.samples < 5) continue;
      const diff = p.median - p.setting;
      if (Math.abs(diff) >= Math.max(0.5, p.setting * 0.2)) {
        const params = { real: round(p.median), set: p.setting };
        tips.push(
          p.step === 'prepare'
            ? t('Prepare took about {real} min, you set {set}. Set prepare to {real} min next time for better estimates.', params)
            : p.step === 'bake'
              ? t('Bake took about {real} min, you set {set}. Set bake to {real} min next time for better estimates.', params)
              : t('Counter took about {real} min, you set {set}. Set counter to {real} min next time for better estimates.', params),
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
  timing: { prepareMinutes: 3, bakeMinutes: 8, counterMinutes: 2, ovens: 1, pizzasPerOven: 4, maxPizzas: 0, price: 0 },
  orders: [],
  soldCleared: 0,
  soldClearedByType: {},
  ovensOut: [],
  hostEpoch: 0,
  hostId: '',
};
