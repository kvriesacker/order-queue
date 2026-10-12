import { Component, computed, inject, input } from '@angular/core';
import { Order, STATUS_LABELS } from '../models';
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
      @if (order().note) {
        <p class="order-note">{{ order().note }}</p>
      }
      @if (showStatus()) {
        <p class="status-label">{{ labels[order().status] | t }}</p>
      }
      <div class="actions"><ng-content /></div>
    </article>
  `,
})
export class OrderCard {
  private queue = inject(QueueService);
  readonly order = input.required<Order>();
  readonly showStatus = input(false);
  protected labels = STATUS_LABELS;

  protected time = computed(() =>
    new Date(this.order().createdAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }),
  );
  protected age = computed(() => {
    const minutes = Math.floor((this.queue.now() - this.order().createdAt) / 60000);
    return minutes < 1 ? t('just now') : t('{n} min', { n: minutes });
  });
}
