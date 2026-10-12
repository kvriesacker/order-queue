import { Component, computed, inject, input } from '@angular/core';
import { DISPLAY_STAGES, Order, STAGE_LABELS, STATUS_LABELS, stageCounts } from '../models';
import { QueueService } from '../queue.service';
import { Eta } from './eta';
import { T, dateLocale, t } from '../i18n/i18n';

@Component({
  selector: 'app-order-card',
  imports: [Eta, T],
  template: `
    <article class="order" [class]="order().status">
      <header>
        <span class="num">#{{ order().number }}</span>
        @if (order().customer) {
          <span class="customer">{{ order().customer }}</span>
        }
        <span class="age" [title]="'Ordered at {time}' | t: { time: time() }">{{ age() }}</span>
      </header>
      <header class="eta-row">
        <app-eta [orderId]="order().id" />
      </header>
      <ng-content select="[pizzas]" />
      @if (showItems()) {
      <ul class="items">
        @for (item of order().items; track $index) {
          <li>
            <span class="dot" [style.background]="item.color"></span>
            <span class="qty">{{ item.qty }}×</span> {{ item.name }}
            @if (item.note) {
              <em class="note">{{ item.note }}</em>
            }
          </li>
        }
      </ul>
      }
      @if (order().note) {
        <p class="order-note">{{ order().note }}</p>
      }
      @if (showStatus()) {
        <p class="status-label">{{ status() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </article>
  `,
})
export class OrderCard {
  private queue = inject(QueueService);
  readonly order = input.required<Order>();
  readonly showStatus = input(false);
  /** Off where the page lists the pizzas itself (the counter, pizza by pizza). */
  readonly showItems = input(true);

  /**
   * Where the order's pizzas are, step by step ("In the oven", or "Being prepared (1) · In
   * the oven (1)" while a big order is split); done and cancelled orders say so.
   */
  protected status = computed(() => {
    const order = this.order();
    if (!['new', 'in-progress', 'ready'].includes(order.status)) return t(STATUS_LABELS[order.status]);
    const counts = stageCounts(order);
    const stages = DISPLAY_STAGES.filter((s) => counts[s]);
    if (stages.length === 1) return t(STAGE_LABELS[stages[0]]);
    return stages.map((s) => `${t(STAGE_LABELS[s])} (${counts[s]})`).join(' · ');
  });

  protected time = computed(() =>
    new Date(this.order().createdAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }),
  );
  protected age = computed(() => {
    const minutes = Math.floor((this.queue.now() - this.order().createdAt) / 60000);
    return minutes < 1 ? t('just now') : t('{n} min', { n: minutes });
  });
}
