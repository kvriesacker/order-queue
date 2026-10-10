import { Component, effect, inject, signal, untracked } from '@angular/core';
import { MenuItem } from '../models';
import { QueueService } from '../queue.service';
import { MenuEditor } from './menu-editor';

/** Lets the host change the menu while the queue is running. */
@Component({
  selector: 'app-menu-page',
  imports: [MenuEditor],
  template: `
    <main class="page narrow-page">
      <section class="card stack">
        <h1>Menu</h1>
        @if (queue.isHost()) {
          <p class="hint">Changes apply to new orders. Orders already placed keep their colors.</p>
          <app-menu-editor [(menu)]="menu" />
          <div class="toolbar">
            <button class="btn primary" type="button" (click)="save()" [disabled]="!dirty()">
              Save menu
            </button>
            @if (saved()) {
              <span class="muted">Saved.</span>
            }
          </div>
        } @else {
          <p class="muted">Only the device that started the queue can change the menu.</p>
        }
      </section>
    </main>
  `,
})
export class MenuPage {
  protected queue = inject(QueueService);
  protected menu = signal<MenuItem[]>([]);
  protected saved = signal(false);
  protected dirty = signal(false);

  constructor() {
    // Load the queue's menu once it's available.
    effect(() => {
      const menu = this.queue.state()?.menu;
      if (menu && untracked(() => !this.dirty())) this.menu.set(menu);
    });
    effect(() => {
      this.menu();
      untracked(() => {
        const current = this.queue.state()?.menu;
        this.dirty.set(JSON.stringify(current) !== JSON.stringify(this.menu()));
      });
    });
  }

  save() {
    this.queue.setMenu(this.menu());
    this.dirty.set(false);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
