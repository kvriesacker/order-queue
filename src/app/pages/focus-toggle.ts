import { Component, DestroyRef, inject } from '@angular/core';
import { T } from '../i18n/i18n';
import { enterFocus, focusMode, leaveFocus } from '../focus';

/**
 * "Full screen" / "Exit full screen" button for a staff page. Full screen belongs to the page
 * that switched it on: going to another tab shows the menu again.
 */
@Component({
  selector: 'app-focus-toggle',
  imports: [T],
  template: `
    @if (focus()) {
      <button class="btn ghost small focus-toggle" type="button" (click)="leave()">
        {{ 'Exit full screen' | t }}
      </button>
    } @else {
      <button class="btn small focus-toggle" type="button" (click)="enter()">
        ⛶ {{ 'Full screen' | t }}
      </button>
    }
  `,
})
export class FocusToggle {
  protected focus = focusMode;
  protected enter = enterFocus;
  protected leave = leaveFocus;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (focusMode()) leaveFocus();
    });
  }
}
