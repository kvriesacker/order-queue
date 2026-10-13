import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { IS_NATIVE } from './app/native';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Installable app: keep the app on the device so it also opens without a connection.
// Not in the Android app, which already has every file on the device.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !IS_NATIVE) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
