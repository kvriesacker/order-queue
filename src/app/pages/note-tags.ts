import { Component, computed, input } from '@angular/core';

/**
 * A pizza's note in the kitchen, oven and counter: each part (extra cheese, spicy, …) as its
 * own bright tag, so nobody misses it (Koen).
 */
@Component({
  selector: 'app-note-tags',
  host: { class: 'note note-tags' },
  template: `
    @for (part of parts(); track $index) {
      <span class="note-tag">{{ part }}</span>
    }
  `,
})
export class NoteTags {
  readonly note = input.required<string>();
  protected parts = computed(() => splitNote(this.note()));
}

/** The parts of a note, as the quick picks put them in: separated by commas. */
export function splitNote(note: string): string[] {
  return note
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}
