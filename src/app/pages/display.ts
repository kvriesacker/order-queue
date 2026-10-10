import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../queue.service';
import { clockTime } from '../estimate';

/** Customer-facing screen: big numbers of orders ready for pickup. */
@Component({
  selector: 'app-display',
  imports: [RouterLink],
  template: `
    <main class="display" (dblclick)="fullscreen()">
      <section class="display-col preparing">
        <h2>Preparing</h2>
        <div class="numbers">
          @for (p of preparing(); track p.number) {
            <span class="prep"
              >{{ p.number }}
              @if (p.eta) {
                <small>≈ {{ clock(p.eta) }}</small>
              }
            </span>
          }
        </div>
      </section>
      <section class="display-col ready">
        <h2>Ready! Please collect</h2>
        <div class="numbers">
          @for (n of ready(); track n) {
            <span [class.fresh]="n === freshest()">{{ n }}</span>
          }
        </div>
      </section>
      <footer class="display-footer">
        <span>{{ queue.state()?.name }}</span>
        <span class="display-controls">
          @if (queue.connection() !== 'online') {
            <span class="pill offline">Offline</span>
          }
          <button type="button" (click)="toggleSound()">
            {{ sound() ? '🔔 Sound on' : '🔕 Sound off' }}
          </button>
          <button type="button" (click)="fullscreen()">Full screen</button>
          <a routerLink="../counter">Back</a>
        </span>
      </footer>
    </main>
  `,
})
export class Display {
  protected queue = inject(QueueService);
  readonly id = input.required<string>();
  protected sound = signal(true);
  protected clock = clockTime;

  private readyOrders = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'ready-for-customer')
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
  protected ready = computed(() => this.readyOrders().map((o) => o.number));
  protected freshest = computed(() => this.ready()[0]);
  protected preparing = computed(() =>
    this.queue
      .orders()
      .filter((o) => o.status === 'new' || o.status === 'in-progress' || o.status === 'ready')
      .map((o) => ({ number: o.number, eta: this.queue.estimates().get(o.id) })),
  );

  private seen = new Set<number>();
  private primed = false;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.queue.open(id));
    });
    // Chime when a new number appears on the screen.
    effect(() => {
      const numbers = this.ready();
      const fresh = numbers.some((n) => !this.seen.has(n));
      numbers.forEach((n) => this.seen.add(n));
      if (fresh && this.primed && untracked(this.sound)) chime();
      this.primed = this.queue.state() !== null;
    });
  }

  toggleSound() {
    this.sound.update((s) => !s);
    if (this.sound()) chime();
  }

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

let audio: AudioContext | undefined;

function chime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.55);
    });
  } catch {
    // Audio not available.
  }
}
