import { Component, signal } from '@angular/core';
import { T } from '../i18n/i18n';

/** The browser's install offer, kept until the user presses the button. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  offer = e as InstallPrompt;
  listeners.forEach((l) => l());
});
addEventListener('appinstalled', () => {
  offer = null;
  listeners.forEach((l) => l());
});

/**
 * Offers to install the app on the home screen: a button where the browser allows it
 * (Chrome, Edge, Android), a short how-to on iPhone and iPad, nothing once installed.
 */
@Component({
  selector: 'app-install',
  imports: [T],
  template: `
    @if (canInstall()) {
      <button class="btn install-btn" type="button" (click)="install()">
        {{ 'Install app on this device' | t }}
      </button>
    } @else if (ios && !installed) {
      <p class="hint install-hint">
        {{ 'To install this app on your iPhone or iPad: tap' | t }}
        <strong>{{ 'Share' | t }}</strong>{{ ', then' | t }}
        <strong>{{ 'Add to Home Screen' | t }}</strong>.
      </p>
    }
  `,
})
export class InstallApp {
  protected canInstall = signal(!!offer);
  protected installed = matchMedia('(display-mode: standalone)').matches;
  protected ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  private update = () => this.canInstall.set(!!offer);

  constructor() {
    listeners.add(this.update);
  }

  ngOnDestroy() {
    listeners.delete(this.update);
  }

  async install() {
    if (!offer) return;
    await offer.prompt();
    await offer.userChoice;
    offer = null;
    this.update();
  }
}
