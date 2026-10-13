import { Component } from '@angular/core';

/** A curved "back" arrow for the undo buttons (Koen: an icon is more compact than text). */
@Component({
  selector: 'app-undo-icon',
  template: `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
})
export class UndoIcon {}
