import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MenuItem } from '../models';
import { MenuEditor } from './menu-editor';

@Component({
  imports: [MenuEditor],
  template: `<app-menu-editor [(menu)]="menu" />`,
})
class Host {
  menu = signal<MenuItem[]>([
    { name: 'Margherita', color: '#e53935', enabled: true },
    { name: 'Funghi', color: '#6d4c41', enabled: true },
  ]);
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  const picker = (label: string) =>
    el.querySelector<HTMLInputElement>(`input[type=color][aria-label="${label}"]`)!;
  return { fixture, el, picker };
}

function pick(input: HTMLInputElement, color: string) {
  input.value = color;
  input.dispatchEvent(new Event('input'));
}

describe('MenuEditor color picker', () => {
  it('shows each pizza with its current color', async () => {
    const { picker } = await setup();
    expect(picker('Color for Margherita').value).toBe('#e53935');
    expect(picker('Color for Funghi').value).toBe('#6d4c41');
  });

  it('changes only the picked pizza’s color', async () => {
    const { fixture, picker } = await setup();
    pick(picker('Color for Funghi'), '#123456');
    await fixture.whenStable();
    expect(fixture.componentInstance.menu()).toEqual([
      { name: 'Margherita', color: '#e53935', enabled: true },
      { name: 'Funghi', color: '#123456', enabled: true },
    ]);
    expect(picker('Color for Funghi').value).toBe('#123456');
  });

  it('keeps the picked color when the pizza is switched off and on', async () => {
    const { fixture, el, picker } = await setup();
    pick(picker('Color for Margherita'), '#00ff00');
    const box = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    box.click();
    box.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menu()[0]).toEqual({
      name: 'Margherita',
      color: '#00ff00',
      enabled: true,
    });
  });

  it('adds a new pizza with the color picked for it', async () => {
    const { fixture, el, picker } = await setup();
    const name = el.querySelector<HTMLInputElement>('input[placeholder="Add a pizza…"]')!;
    name.value = 'Calzone';
    name.dispatchEvent(new Event('input'));
    pick(picker('Color for the new pizza'), '#abcdef');
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.inline button')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menu().at(-1)).toEqual({
      name: 'Calzone',
      color: '#abcdef',
      enabled: true,
    });
    // The new pizza gets its own picker, showing its color.
    expect(picker('Color for Calzone').value).toBe('#abcdef');
  });
});
