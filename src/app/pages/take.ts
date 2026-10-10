import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NewOrderItem, OTHER_COLOR } from '../models';

const QUICK_NOTES = ['No cheese', 'Extra cheese', 'No onion', 'Spicy', 'Gluten free', 'Well done'];
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
          @for (pizza of menu(); track pizza.name) {
            <button
              class="menu-item"
              type="button"
              [style.border-left-color]="pizza.color"
              (click)="add(pizza.name, pizza.color)"
            >
              {{ pizza.name }}
            </button>
          }
        </div>
        <form class="inline" (ngSubmit)="addCustom()">
          <input name="custom" [(ngModel)]="custom" placeholder="Something else…" maxlength="60" />
          <button class="btn" type="submit" [disabled]="!custom.trim()">Add</button>
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

function splitNote(note: string): string[] {
  return note
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}
