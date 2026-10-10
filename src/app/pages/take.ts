import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MENU, OrderItem } from '../models';
import { QueueService } from '../queue.service';
import { OrderCard } from './order-card';

@Component({
  selector: 'app-take',
  imports: [FormsModule, OrderCard],
  template: `
    <main class="page take">
      <section class="card stack">
        <h1>New order</h1>
        <div class="menu">
          @for (pizza of menu; track pizza.name) {
            <button class="menu-item" type="button" (click)="add(pizza.name)">
              <span aria-hidden="true">{{ pizza.emoji }}</span> {{ pizza.name }}
            </button>
          }
        </div>
        <form class="inline" (ngSubmit)="addCustom()">
          <input name="custom" [(ngModel)]="custom" placeholder="Something else…" maxlength="60" />
          <button class="btn" type="submit" [disabled]="!custom.trim()">Add</button>
        </form>

        @if (cart().length) {
          <ul class="cart">
            @for (line of cart(); track $index) {
              <li>
                <div class="qty-ctl">
                  <button
                    class="btn icon"
                    type="button"
                    (click)="bump($index, -1)"
                    aria-label="One less"
                  >
                    −
                  </button>
                  <span class="qty">{{ line.qty }}</span>
                  <button
                    class="btn icon"
                    type="button"
                    (click)="bump($index, 1)"
                    aria-label="One more"
                  >
                    +
                  </button>
                </div>
                <span class="line-name">{{ line.name }}</span>
                <input
                  class="line-note"
                  [ngModel]="line.note"
                  (ngModelChange)="setNote($index, $event)"
                  [ngModelOptions]="{ standalone: true }"
                  placeholder="Extra cheese, no onion…"
                  maxlength="120"
                />
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Tap a pizza to add it to the order.</p>
        }

        <div class="grid2">
          <label>
            <span>Customer name <span class="muted">(optional)</span></span>
            <input name="customer" [(ngModel)]="customer" maxlength="40" />
          </label>
          <label>
            <span>Order note <span class="muted">(optional)</span></span>
            <input
              name="note"
              [(ngModel)]="note"
              maxlength="200"
              placeholder="Take away, allergy…"
            />
          </label>
        </div>
        <button class="btn primary big" type="button" [disabled]="!cart().length" (click)="send()">
          Send to kitchen
        </button>
        @if (lastNumber()) {
          <p class="sent">
            Order <strong>#{{ lastNumber() }}</strong> sent. Give the customer this number.
          </p>
        } @else if (lastId()) {
          <p class="sent pending">Sending order…</p>
        }
      </section>

      <section class="stack">
        <h2>Open orders</h2>
        @for (order of open(); track order.id) {
          <app-order-card [order]="order" [showStatus]="true">
            @if (order.status === 'new') {
              <button class="btn danger" type="button" (click)="cancel(order.id)">Cancel</button>
            }
          </app-order-card>
        } @empty {
          <p class="muted">No open orders.</p>
        }
      </section>
    </main>
  `,
})
export class Take {
  protected queue = inject(QueueService);
  protected menu = MENU;
  protected cart = signal<OrderItem[]>([]);
  protected custom = '';
  protected customer = '';
  protected note = '';
  /** The id of the order just sent, so we can show its number once the host assigns it. */
  protected lastId = signal('');

  protected open = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status !== 'collected' && o.status !== 'cancelled')
      .slice()
      .reverse(),
  );
  protected lastNumber = computed(
    () => this.queue.orders().find((o) => o.id === this.lastId())?.number,
  );

  add(name: string) {
    this.cart.update((cart) => {
      const i = cart.findIndex((l) => l.name === name && !l.note);
      if (i >= 0) return cart.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...cart, { name, qty: 1, note: '' }];
    });
  }

  addCustom() {
    if (!this.custom.trim()) return;
    this.add(this.custom.trim());
    this.custom = '';
  }

  bump(index: number, delta: number) {
    this.cart.update((cart) =>
      cart.map((l, i) => (i === index ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );
  }

  setNote(index: number, note: string) {
    this.cart.update((cart) => cart.map((l, i) => (i === index ? { ...l, note } : l)));
  }

  send() {
    const id = this.queue.addOrder(this.customer, this.cart(), this.note);
    this.lastId.set(id);
    this.cart.set([]);
    this.customer = '';
    this.note = '';
  }

  cancel(id: string) {
    const order = this.queue.orders().find((o) => o.id === id);
    if (order && confirm(`Cancel order #${order.number}?`))
      this.queue.setStatus(order, 'cancelled');
  }
}
