import { Component, computed, inject } from '@angular/core';
import { textOn } from '../models';
import { QueueService } from '../queue.service';

interface OvenPizza {
  key: string;
  number: number;
  name: string;
  color: string;
}

/**
 * For the oven station: each oven with the pizzas in it, and a switch to mark an oven out of
 * order. Prepared pizzas fill the working ovens in the order they came from the kitchen;
 * when those are full, the rest wait for a spot. Estimates only count working ovens.
 */
@Component({
  selector: 'app-ovens',
  template: `
    <div class="ovens-row">
      @for (oven of ovens(); track oven.index) {
        <article class="oven" [class.broken]="oven.out" [class.full]="!oven.out && oven.pizzas.length === perOven()">
          <header>
            <strong>Oven {{ oven.index + 1 }}</strong>
            @if (oven.out) {
              <span class="oven-count">Out of order</span>
            } @else {
              <span class="oven-count">{{ oven.pizzas.length }} / {{ perOven() }} pizzas</span>
            }
          </header>
          @if (!oven.out) {
            <ul class="oven-pizzas">
              @for (p of oven.pizzas; track p.key) {
                <li class="chip" [style.background]="p.color" [style.color]="textOn(p.color)">
                  #{{ p.number }} {{ p.name }}
                </li>
              } @empty {
                <li class="muted">Empty</li>
              }
            </ul>
          }
          <button
            class="btn small"
            [class.danger]="!oven.out"
            type="button"
            (click)="queue.setOvenOut(oven.index, !oven.out)"
          >
            {{ oven.out ? 'Working again' : 'Mark out of order' }}
          </button>
        </article>
      }
    </div>
    @if (waiting() > 0) {
      <p class="oven-waiting">
        {{ waiting() }} prepared {{ waiting() === 1 ? 'pizza waits' : 'pizzas wait' }} for a
        free spot{{ working() === 0 ? ': every oven is out of order' : '' }}.
      </p>
    }
  `,
})
export class Ovens {
  protected queue = inject(QueueService);
  protected textOn = textOn;
  protected perOven = computed(() => this.queue.state()?.timing.pizzasPerOven ?? 0);

  /** Prepared pizzas, in the order they came from the kitchen. */
  private prepared = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress')
      .flatMap((o) =>
        o.items.flatMap((item, i) =>
          item.units.flatMap((u, j) =>
            u === 'prepared'
              ? [{ key: `${o.id}-${i}-${j}`, number: o.number, name: item.name, color: item.color,
                   at: item.times[j]?.prepared ?? o.createdAt }]
              : [],
          ),
        ),
      )
      .sort((a, b) => a.at - b.at),
  );

  protected ovens = computed(() => {
    const state = this.queue.state();
    if (!state) return [];
    const queue: OvenPizza[] = [...this.prepared()];
    const per = state.timing.pizzasPerOven;
    return Array.from({ length: state.timing.ovens }, (_, index) => {
      const out = state.ovensOut.includes(index);
      return { index, out, pizzas: out ? [] : queue.splice(0, per) };
    });
  });
  protected working = computed(() => this.ovens().filter((o) => !o.out).length);
  protected waiting = computed(
    () => this.prepared().length - this.ovens().reduce((n, o) => n + o.pizzas.length, 0),
  );
}
