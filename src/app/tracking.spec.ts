import { describe, expect, it } from 'vitest';
import { OrderTrack, trackAlert } from './tracking';

const base: OrderTrack = { shop: 'Napoli', number: 7, customer: 'Anna', pizzas: '1× Margherita', status: 'new', stage: 'ordered' };
const at = (patch: Partial<OrderTrack>): OrderTrack => ({ ...base, ...patch });

describe('trackAlert', () => {
  it('alerts once when the order goes into the oven and once when it is ready', () => {
    expect(trackAlert(at({}), at({ status: 'in-progress', stage: 'preparing' }))).toBeNull();
    expect(trackAlert(at({ stage: 'preparing' }), at({ status: 'in-progress', stage: 'baking' }))).toBe('baking');
    expect(trackAlert(at({ stage: 'baking' }), at({ stage: 'baking', eta: 123 }))).toBeNull();
    expect(trackAlert(at({ status: 'ready', stage: 'baking' }), at({ status: 'ready-for-customer', stage: 'ready' }))).toBe('ready');
    expect(trackAlert(at({ status: 'ready-for-customer', stage: 'ready' }), at({ status: 'ready-for-customer', stage: 'ready' }))).toBeNull();
  });

  it('says nothing about what was already true when the page opened', () => {
    expect(trackAlert(null, at({ stage: 'baking' }))).toBeNull();
    expect(trackAlert(null, at({ status: 'ready-for-customer', stage: 'ready' }))).toBeNull();
  });

  it('skips straight to ready when baking and calling happen between two updates', () => {
    expect(trackAlert(at({ stage: 'preparing' }), at({ status: 'ready-for-customer', stage: 'ready' }))).toBe('ready');
  });
});
