import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { lang, t } from './i18n';

/** Page titles in the current language, and the page's lang attribute to match. */
@Injectable({ providedIn: 'root' })
export class TranslatedTitle extends TitleStrategy {
  private title = inject(Title);
  private current = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      document.documentElement.lang = lang();
      const title = this.current();
      if (title) this.title.setTitle(t(title));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.current.set(this.buildTitle(snapshot));
  }
}
