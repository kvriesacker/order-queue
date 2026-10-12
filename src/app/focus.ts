import { signal } from '@angular/core';

/**
 * Full screen for staff pages (orders, kitchen, oven, counter): only the work, without the top
 * bar, tabs or settings. On while a page has it switched on.
 */
export const focusMode = signal(false);

export function enterFocus(): void {
  focusMode.set(true);
  document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function leaveFocus(): void {
  focusMode.set(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}

// Leaving the browser's full screen (Escape) leaves focus mode too.
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) focusMode.set(false);
  });
}
