import { DestroyRef, Pipe, PipeTransform, computed, effect, inject, signal } from '@angular/core';
import { NL } from './nl';

/** The languages the app speaks. Dutch is the default. */
export type Lang = 'nl' | 'en';
export const LANGS: Lang[] = ['nl', 'en'];
export const DEFAULT_LANG: Lang = 'nl';
const KEY = 'pizza-queue:lang';

export function isLang(value: unknown): value is Lang {
  return value === 'nl' || value === 'en';
}

function stored(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

/** The language picked on this device with the NL/EN switch; null until someone picks one. */
export const deviceLang = signal<Lang | null>(stored());
/** The default language of the queue this device has open (set in its Settings). */
export const queueLang = signal<Lang | null>(null);
/**
 * Set while a screen for customers is open (customer screens, the order follow page): those
 * speak the queue's language, whatever the staff device was switched to.
 */
export const customerLang = signal<Lang | null>(null);

/** The language shown right now. */
export const lang = computed<Lang>(
  () => customerLang() ?? deviceLang() ?? queueLang() ?? DEFAULT_LANG,
);

/** For dates and times: Dutch ones in Dutch (24-hour clock), the browser's own in English. */
export function dateLocale(): string[] {
  return lang() === 'nl' ? ['nl-BE'] : [];
}

export function setDeviceLang(value: Lang): void {
  deviceLang.set(value);
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
}

/**
 * The text in the current language. Texts are written in English in the code and looked up in
 * the Dutch list; `{name}` placeholders are filled from `params`.
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const s = lang() === 'nl' ? (NL[text] ?? text) : text;
  return params ? s.replace(/\{(\w+)\}/g, (all, key) => (key in params ? String(params[key]) : all)) : s;
}

/**
 * For a screen customers look at: speak the queue's language (`source`) while it's open,
 * whatever this device was switched to. Call from a component's constructor.
 */
export function speakToCustomers(source: () => Lang | null | undefined): void {
  // Until the queue is there (or while it asks staff for its password), the device's own.
  const ref = effect(() => customerLang.set(source() ?? null));
  inject(DestroyRef).onDestroy(() => {
    ref.destroy();
    customerLang.set(null);
  });
}

/** `{{ 'Next customer' | t }}` or `{{ 'Only {n} left' | t: { n: left } }}` in templates. */
@Pipe({ name: 't', pure: false })
export class T implements PipeTransform {
  transform(text: string, params?: Record<string, string | number>): string {
    return t(text, params);
  }
}
