import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NewOrderItem, OTHER_COLOR } from '../models';

const QUICK_NOTES = ['No cheese', 'Extra cheese', 'No onion', 'Spicy', 'Gluten free', 'Well done'];
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil } from '../estimate';
import { OrderCard } from './order-card';

@Component({
  selector: 'app-take',
  imports: [FormsModule, OrderCard],
  template: `
    <main class="page take">
      <section class="card stack">
        <div class="take-head">
          <h1>New order</h1>
          <a class="btn small" [href]="screenLink()" target="_blank" rel="noopener"
            >Customer screen ↗</a
          >
        </div>
        @if (left() !== null) {
          <p class="left-note" [class.low]="canAdd() === false || left()! <= 10">
            @if (overLimit()) {
              Only <strong>{{ left() }}</strong> {{ left() === 1 ? 'pizza' : 'pizzas' }} left.
              Remove {{ cart().length - left()! }} from this order to send it.
            } @else if (left() === 0) {
              <strong>Sold out.</strong> No more pizzas can be sold.
            } @else {
              <strong>{{ left() }}</strong> {{ left() === 1 ? 'pizza' : 'pizzas' }} still available{{
                cart().length ? ', ' + (left()! - cart().length) + ' after this order' : ''
              }}.
            }
          </p>
        }
        <div class="menu">
          @for (pizza of menu(); track pizza.name) {
            <button
              class="menu-item"
              type="button"
              [style.border-left-color]="pizza.color"
              [disabled]="!canAdd()"
              (click)="add(pizza.name, pizza.color)"
            >
              {{ pizza.name }}
            </button>
          }
        </div>
        <form class="inline" (ngSubmit)="addCustom()">
          <input name="custom" [(ngModel)]="custom" placeholder="Something else…" maxlength="60" />
          <button class="btn" type="submit" [disabled]="!custom.trim() || !canAdd()">Add</button>
        </form>

        @if (cart().length) {
          <ol class="cart">
            @for (line of cart(); track $index; let i = $index) {
              <li [style.border-left-color]="line.color">
                <div class="line-head">
                  <span class="line-num">{{ i + 1 }}</span>
                  <span class="line-name">{{ line.name }}</span>
                  <button
                    class="btn ghost small"
                    type="button"
                    [disabled]="!canAdd()"
                    (click)="duplicate(i)"
                    aria-label="Add another one"
                  >
                    + same
                  </button>
                  <button
                    class="btn ghost small"
                    type="button"
                    (click)="remove(i)"
                    aria-label="Remove this pizza"
                  >
                    ✕
                  </button>
                </div>
                <div class="quick-notes">
                  @for (q of quickNotes; track q) {
                    <button
                      class="note-chip"
                      type="button"
                      [class.on]="hasNote(line.note, q)"
                      (click)="toggleNote(i, q)"
                    >
                      {{ q }}
                    </button>
                  }
                </div>
                <input
                  class="line-note"
                  [ngModel]="line.note"
                  (ngModelChange)="setNote(i, $event)"
                  [ngModelOptions]="{ standalone: true }"
                  placeholder="Note for this pizza…"
                  maxlength="120"
                />
              </li>
            }
          </ol>
        } @else {
          <p class="muted">Tap a pizza to add it. Each pizza gets its own line and note.</p>
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
        <button class="btn primary big" type="button" [disabled]="!cart().length || overLimit()" (click)="send()">
          Send to kitchen
        </button>
        @if (refused()) {
          <p class="sent refused">
            Not sent: there weren’t enough pizzas left for this order. Check the order and send it
            again.
          </p>
        } @else if (lastNumber()) {
          <p class="sent">
            Order <strong>#{{ lastNumber() }}</strong> sent. Give the customer this number.
            @if (lastEta(); as t) {
              <br />Estimated ready at <strong>{{ clock(t) }}</strong> ({{ until(t) }}).
            }
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
  protected menu = computed(() => (this.queue.state()?.menu ?? []).filter((m) => m.enabled));
  protected cart = signal<NewOrderItem[]>([]);
  protected quickNotes = QUICK_NOTES;
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
  private lastCart: { cart: NewOrderItem[]; customer: string; note: string } | null = null;

  constructor() {
    // Put a refused order back so it can be fixed and sent again.
    effect(() => {
      if (!this.refused() || !this.lastCart) return;
      const last = this.lastCart;
      this.lastCart = null;
      untracked(() => {
        this.cart.set(last.cart);
        this.customer = last.customer;
        this.note = last.note;
      });
    });
  }

  /** Pizzas that can still be sold, or null without a limit. */
  protected left = computed(() => this.queue.pizzasLeft());
  protected canAdd = computed(() => {
    const left = this.left();
    return left === null || this.cart().length < left;
  });
  protected overLimit = computed(() => {
    const left = this.left();
    return left !== null && this.cart().length > left;
  });
  /** The order just sent was refused because another order took the last pizzas. */
  protected refused = computed(() => this.queue.refused().has(this.lastId()));
  protected lastEta = computed(() => this.queue.estimates().get(this.lastId()));
  protected clock = clockTime;
  /** The screen facing the customer while ordering, best opened on a second display. */
  protected screenLink = computed(() => this.queue.shareLink(this.queue.state()?.id) + '/order-screen');
  protected until = (t: number) => minutesUntil(t, this.queue.now());
  protected lastNumber = computed(
    () => this.queue.orders().find((o) => o.id === this.lastId())?.number,
  );

  /** Every pizza is its own line, so each one can have its own note. */
  add(name: string, color: string) {
    this.cart.update((cart) => [...cart, { name, qty: 1, note: '', color }]);
  }

  addCustom() {
    if (!this.custom.trim()) return;
    this.add(this.custom.trim(), OTHER_COLOR);
    this.custom = '';
  }

  duplicate(index: number) {
    this.cart.update((cart) => [
      ...cart.slice(0, index + 1),
      { ...cart[index], note: '' },
      ...cart.slice(index + 1),
    ]);
  }

  remove(index: number) {
    this.cart.update((cart) => cart.filter((_, i) => i !== index));
  }

  setNote(index: number, note: string) {
    this.cart.update((cart) => cart.map((l, i) => (i === index ? { ...l, note } : l)));
  }

  hasNote(note: string, quick: string): boolean {
    return splitNote(note).some((n) => n.toLowerCase() === quick.toLowerCase());
  }

  toggleNote(index: number, quick: string) {
    const parts = splitNote(this.cart()[index].note);
    const next = this.hasNote(this.cart()[index].note, quick)
      ? parts.filter((n) => n.toLowerCase() !== quick.toLowerCase())
      : [...parts, quick];
    this.setNote(index, next.join(', '));
  }

  send() {
    if (this.overLimit()) return;
    const cart = this.cart();
    const id = this.queue.addOrder(this.customer, cart, this.note);
    this.lastId.set(id);
    // Keep the order to try again if it gets refused.
    this.lastCart = { cart, customer: this.customer, note: this.note };
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

function splitNote(note: string): string[] {
  return note
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}
