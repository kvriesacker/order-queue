import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { QueueService } from '../queue.service';
import { DEFAULT_SPONSOR_SECONDS } from '../models';
import { T } from '../i18n/i18n';

/**
 * The sponsors set in Settings, one at a time on a customer screen. They change every few
 * seconds by the clock, so every screen in the shop shows the same sponsor. Nothing shows
 * without sponsors.
 */
@Component({
  selector: 'app-sponsor-banner',
  imports: [T],
  template: `
    <!-- One at a time; a new sponsor is a new banner, so it fades in. -->
    @for (s of sponsor(); track s.turn) {
      <aside class="sponsor-banner" [attr.aria-label]="'Sponsors' | t">
        <span class="sponsor-thanks">{{ 'With thanks to' | t }}</span>
        <strong class="sponsor-name">{{ s.name }}</strong>
        @if (s.message) {
          <span class="sponsor-message">{{ s.message }}</span>
        }
      </aside>
    }
  `,
})
export class SponsorBanner {
  private queue = inject(QueueService);
  private clock = signal(Date.now());

  protected sponsor = computed(() => {
    const state = this.queue.state();
    const sponsors = state?.sponsors ?? [];
    if (!sponsors.length) return [];
    const seconds = state?.sponsorSeconds ?? DEFAULT_SPONSOR_SECONDS;
    const turn = Math.floor(this.clock() / (seconds * 1000));
    return [{ ...sponsors[turn % sponsors.length], turn }];
  });

  constructor() {
    const timer = setInterval(() => this.clock.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
