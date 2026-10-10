import { Component, computed, inject, input } from '@angular/core';
import { Order, STATUS_LABELS } from '../models';
import { QueueService } from '../queue.service';

@Component({
  selector: 'app-order-card',
  template: `
    <article class="order" [class]="order().status">
      <header>
        <span class="num">#{{ order().number }}</span>
        @if (order().customer) {
          <span class="customer">{{ order().customer }}</span>
        }
        <span class="age" [title]="'Ordered at ' + time()">{{ age() }}</span>
      </header>
      <ul class="items">
        @for (item of order().items; track $index) {
          <li>
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
        <p class="status-label">{{ labels[order().status] }}</p>
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
    new Date(this.order().createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  );
  protected age = computed(() => {
    const minutes = Math.floor((this.queue.now() - this.order().createdAt) / 60000);
    return minutes < 1 ? 'just now' : `${minutes} min`;
  });
}
