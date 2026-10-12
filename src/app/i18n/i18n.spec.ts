import { beforeEach, describe, expect, it } from 'vitest';
import { customerLang, deviceLang, lang, queueLang, t } from './i18n';

describe('languages', () => {
  beforeEach(() => {
    deviceLang.set(null);
    queueLang.set(null);
    customerLang.set(null);
  });

  it('speaks Dutch by default', () => {
    expect(lang()).toBe('nl');
    expect(t('Next customer')).toBe('Volgende klant');
  });

  it("follows the queue's language until the device picks its own", () => {
    queueLang.set('en');
    expect(t('Next customer')).toBe('Next customer');
    deviceLang.set('nl');
    expect(t('Next customer')).toBe('Volgende klant');
  });

  it("speaks the queue's language on customer screens, whatever the device picked", () => {
    deviceLang.set('en');
    customerLang.set('nl');
    expect(t('Sold out')).toBe('Uitverkocht');
  });

  it('fills in values and keeps texts it has no Dutch for', () => {
    expect(t('{n} pizzas left', { n: 3 })).toBe("Nog 3 pizza's");
    deviceLang.set('en');
    expect(t('{n} pizzas left', { n: 3 })).toBe('3 pizzas left');
    deviceLang.set('nl');
    expect(t('Something new')).toBe('Something new');
  });
});
