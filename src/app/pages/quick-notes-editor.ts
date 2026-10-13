import { Component, model } from '@angular/core';
import { MAX_QUICK_NOTES, MAX_QUICK_NOTE_LENGTH, cleanQuickNotes } from '../models';
import { T } from '../i18n/i18n';

/**
 * The quick picks for a pizza's note (extra cheese, spicy, …), set by the host (Koen).
 * With none, taking an order only has the free text note.
 */
@Component({
  selector: 'app-quick-notes-editor',
  imports: [T],
  template: `
    <ul class="quick-notes-editor">
      @for (note of notes(); track note; let i = $index) {
        <li class="note-chip on">
          {{ note }}
          <button
            type="button"
            class="chip-remove"
            (click)="remove(i)"
            [attr.aria-label]="'Remove option {name}' | t: { name: note }"
          >
            ✕
          </button>
        </li>
      } @empty {
        <li class="muted">{{ 'No options: only the free text note per pizza.' | t }}</li>
      }
    </ul>
    <div class="quick-notes-add">
      <input
        #input
        [attr.maxlength]="maxLength"
        [placeholder]="'New option, e.g. Extra cheese' | t"
        [attr.aria-label]="'New option' | t"
        (keydown.enter)="$event.preventDefault(); add(input)"
      />
      <button
        class="btn small"
        type="button"
        (click)="add(input)"
        [disabled]="notes().length >= max"
      >
        {{ '+ Add option' | t }}
      </button>
    </div>
  `,
})
export class QuickNotesEditor {
  readonly notes = model.required<string[]>();
  protected max = MAX_QUICK_NOTES;
  protected maxLength = MAX_QUICK_NOTE_LENGTH;

  add(input: HTMLInputElement) {
    if (!input.value.trim()) return;
    this.notes.set(cleanQuickNotes([...this.notes(), input.value]));
    input.value = '';
    input.focus();
  }

  remove(index: number) {
    this.notes.update((list) => list.filter((_, i) => i !== index));
  }
}
