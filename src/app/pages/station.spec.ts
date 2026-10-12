import { byType } from './station';

describe('byType', () => {
  const menu = [{ name: 'Margherita' }, { name: 'Funghi' }, { name: 'Diavola' }];

  it('groups an order’s pizzas by type, in menu order', () => {
    const rows = ['Diavola', 'Margherita', 'Funghi', 'Margherita'].map((name, i) => ({ name, i }));
    expect(byType(rows, menu).map((r) => r.i)).toEqual([1, 3, 2, 0]);
  });

  it('puts pizzas that are not on the menu last, by name', () => {
    const rows = [{ name: 'Zeppole' }, { name: 'Calzone' }, { name: 'Funghi' }];
    expect(byType(rows, menu).map((r) => r.name)).toEqual(['Funghi', 'Calzone', 'Zeppole']);
  });
});
