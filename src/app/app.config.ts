import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { TranslatedTitle } from './i18n/title';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  // Hash URLs (#/q/abc123) so shared links work on static hosts like GitHub Pages.
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    { provide: TitleStrategy, useClass: TranslatedTitle },
  ],
};
