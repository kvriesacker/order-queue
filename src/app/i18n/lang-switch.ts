import { Component } from '@angular/core';
import { LANGS, lang, setDeviceLang } from './i18n';

/** NL / EN switch: the language of this device, whatever the queue's default is. */
@Component({
  selector: 'app-lang-switch',
  template: `
    <span class="lang-switch" role="group" aria-label="Taal / Language">
      @for (l of langs; track l) {
        <button
          type="button"
          [attr.aria-pressed]="lang() === l"
          [attr.lang]="l"
          [title]="l === 'nl' ? 'Nederlands' : 'English'"
          (click)="set(l)"
        >
          {{ l.toUpperCase() }}
        </button>
      }
    </span>
  `,
})
export class LangSwitch {
  protected langs = LANGS;
  protected lang = lang;
  protected set = setDeviceLang;
}
