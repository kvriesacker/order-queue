import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NewOrderItem, OTHER_COLOR, formatPrice, orderTotal, priceOf, randomId } from '../models';

const QUICK_NOTES = ['No cheese', 'Extra cheese', 'No onion', 'Spicy', 'Gluten free', 'Well done'];
import { QueueService } from '../queue.service';
import { clockTime, minutesUntil } from '../estimate';
import { OrderCard } from './order-card';

@Component({
  selector: 'app-take',
  imports: [FormsModule, OrderCard],
  host: { '(document:keydown.escape)': 'showOpen.set(false)' },
  template: `
    <main class="page take">
      <section class="card take-card">
        <div class="take-pick stack">
        <div class="take-head">
          <h1>New order</h1>
          <span class="take-links">
            <button
              class="btn small open-toggle"
              type="button"
              aria-haspopup="dialog"
              (click)="showOpen.set(true)"
            >
              Open orders <span class="count">{{ open().length }}</span>
            </button>
            <a class="btn small" [href]="screenLink()" target="_blank" rel="noopener"
              >Customer screen ↗</a
            >
          </span>
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
            @let typeLeft = typeLeftAfterCart(pizza.name);
            <button
              class="menu-item"
              type="button"
              [style.border-left-color]="pizza.color"
              [class.sold-out]="typeLeft === 0"
              [disabled]="!canAdd() || typeLeft === 0"
              (click)="add(pizza.name, pizza.color)"
            >
              {{ pizza.name }}
              @if (queue.typeLeft().get(pizza.name) === 0) {
                <small class="type-left">Sold out</small>
              } @else if (typeLeft !== null) {
                <small class="type-left">{{ typeLeft }} left</small>
              }
            </button>
          }
        </div>
        <form class="inline" (ngSubmit)="addCustom()">
          <input name="custom" [(ngModel)]="custom" placeholder="Something else…" maxlength="60" />
          <button class="btn" type="submit" [disabled]="!custom.trim() || !canAdd()">Add</button>
        </form>
        </div>

        <div class="take-cart stack">
        <h2 class="cart-title">This order <span class="count">{{ cart().length }}</span></h2>
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
                    [disabled]="!canAdd() || typeLeftAfterCart(line.name) === 0"
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
        </div>

        <div class="take-pay stack">
        @if (totals(); as t) {
          <table class="totals">
            <tbody>
              @for (line of t.lines; track line.name) {
                <tr>
                  <td>{{ line.count }}× {{ line.name }}</td>
                  <td class="num muted">{{ line.count }} × {{ price(line.price) }}</td>
                  <td class="num">{{ price(line.subtotal) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th colspan="2">Total ({{ t.count }} {{ t.count === 1 ? 'pizza' : 'pizzas' }})</th>
                <th class="num">{{ price(t.total) }}</th>
              </tr>
            </tfoot>
          </table>
        }

        <div class="grid2">
          <label>
            <span>Customer name <span class="muted">(optional)</span></span>
            <input
              name="customer"
              [ngModel]="customer()"
              (ngModelChange)="customer.set($event)"
              maxlength="40"
            />
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
        @for (t of overType(); track t.name) {
          <p class="left-note low">
            Only <strong>{{ t.left }}</strong> {{ t.name }} left. Remove {{ t.over }} from this
            order to send it.
          </p>
        }
        <button
          class="btn primary big"
          type="button"
          [disabled]="!cart().length || overLimit() || overType().length"
          (click)="send()"
        >
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
            @if (lastTotal()) {
              <br />To pay: <strong>{{ price(lastTotal()) }}</strong>
            }
            @if (lastEta(); as t) {
              <br />Estimated ready at <strong>{{ clock(t) }}</strong> ({{ until(t) }}).
            }
          </p>
          @if (!cart().length) {
            <button class="btn qr-again" type="button" (click)="showQr.set(!showQr())">
              {{ showQr() ? 'Hide QR code' : 'Show QR code' }}
            </button>
          }
        } @else if (lastId()) {
          <p class="sent pending">Sending order…</p>
        }
        </div>
      </section>

      @if (showOpen()) {
        <div class="drawer-backdrop" (click)="showOpen.set(false)"></div>
      }
      <section
        class="open-orders stack"
        role="dialog"
        aria-label="Open orders"
        [class.shown]="showOpen()"
        [attr.aria-hidden]="!showOpen()"
        [inert]="!showOpen()"
      >
        <div class="take-head">
          <h2>Open orders</h2>
          <button class="btn ghost small" type="button" (click)="showOpen.set(false)">
            Close ✕
          </button>
        </div>
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
  protected customer = signal('');
  /** The open orders slide in from the side only when asked, to leave room for the order. */
  protected showOpen = signal(false);
  /** This order point, so its customer screen follows only this tab. */
  private pos = orderPoint();
  /** The id the order being taken will get, so the customer can scan its QR code early. */
  private draftId = signal(randomId(10));
  /** Keep showing the QR code of the order just sent on the customer screen (on by default). */
  protected showQr = signal(false);
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
    // The customer screen follows the order as it's taken.
    effect(() => {
      // Sent again once connected, so a screen that opens later still gets it.
      this.queue.connection();
      this.queue.publishDraft({
        pos: this.pos,
        orderId: this.draftId(),
        customer: this.customer().trim(),
        pizzas: this.cart().map((l) => ({ name: l.name, color: l.color, price: this.priceFor(l.name) })),
        sentId: this.lastId(),
        showQr: this.showQr(),
        at: Date.now(),
      });
    });
    // Put a refused order back so it can be fixed and sent again.
    effect(() => {
      if (!this.refused() || !this.lastCart) return;
      const last = this.lastCart;
      this.lastCart = null;
      untracked(() => {
        this.cart.set(last.cart);
        this.customer.set(last.customer);
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
  protected price = formatPrice;
  /** What one pizza of this name costs (custom pizzas: the general price). */
  private priceFor(name: string): number {
    const state = this.queue.state();
    return state ? priceOf(state, name) : 0;
  }
  /** The order's price per pizza type and in total, when the queue has prices. */
  protected totals = computed(() => {
    const cart = this.cart();
    if (!cart.length) return null;
    const lines = new Map<string, { name: string; count: number; price: number; subtotal: number }>();
    for (const l of cart) {
      const line = lines.get(l.name) ?? { name: l.name, count: 0, price: this.priceFor(l.name), subtotal: 0 };
      line.count++;
      line.subtotal = Math.round(line.count * line.price * 100) / 100;
      lines.set(l.name, line);
    }
    const all = [...lines.values()];
    if (all.every((l) => !l.price)) return null;
    const total = Math.round(all.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;
    return { lines: all, count: cart.length, total };
  });
  /** How many more of a menu pizza can go in this order (null: no maximum for that type). */
  protected typeLeftAfterCart(name: string): number | null {
    const left = this.queue.typeLeft().get(name);
    if (left === null || left === undefined) return null;
    return Math.max(0, left - this.cart().filter((l) => l.name === name).length);
  }
  /** Pizza types in this order that go over what's left of them (someone else sold them). */
  protected overType = computed(() => {
    const counts = new Map<string, number>();
    for (const l of this.cart()) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
    return [...counts]
      .map(([name, qty]) => ({ name, qty, left: this.queue.typeLeft().get(name) }))
      .filter((t): t is { name: string; qty: number; left: number } => t.left != null && t.qty > t.left)
      .map((t) => ({ name: t.name, left: t.left, over: t.qty - t.left }));
  });
  /** The order just sent was refused because another order took the last pizzas. */
  protected refused = computed(() => this.queue.refused().has(this.lastId()));
  protected lastEta = computed(() => this.queue.estimates().get(this.lastId()));
  protected clock = clockTime;
  /** The screen facing the customer while ordering, best opened on a second display. */
  protected screenLink = computed(
    () => `${this.queue.shareLink(this.queue.state()?.id)}/order-screen?pos=${this.pos}`,
  );
  protected until = (t: number) => minutesUntil(t, this.queue.now());
  protected lastTotal = computed(() => {
    const order = this.queue.orders().find((o) => o.id === this.lastId());
    return order ? orderTotal(order) : 0;
  });
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
    if (this.overLimit() || this.overType().length) return;
    const cart = this.cart();
    const id = this.queue.addOrder(this.customer(), cart, this.note, this.draftId());
    this.draftId.set(randomId(10));
    this.showQr.set(true);
    this.lastId.set(id);
    // Keep the order to try again if it gets refused.
    this.lastCart = { cart, customer: this.customer(), note: this.note };
    this.cart.set([]);
    this.customer.set('');
    this.note = '';
  }

  cancel(id: string) {
    const order = this.queue.orders().find((o) => o.id === id);
    if (order && confirm(`Cancel order #${order.number}?`))
      this.queue.setStatus(order, 'cancelled');
  }
}

/** An id for this tab's order point, kept across reloads of the tab. */
function orderPoint(): string {
  try {
    const saved = sessionStorage.getItem('pizza-queue:pos');
    if (saved) return saved;
    const id = randomId(8);
    sessionStorage.setItem('pizza-queue:pos', id);
    return id;
  } catch {
    return randomId(8);
  }
}

function splitNote(note: string): string[] {
  return note
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}
