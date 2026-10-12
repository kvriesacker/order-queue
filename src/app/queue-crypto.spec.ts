import { describe, expect, it } from 'vitest';
import { QueueCrypto } from './queue-crypto';

describe('QueueCrypto with a password', () => {
  it('puts the queue somewhere else that only the password opens', async () => {
    const plain = await QueueCrypto.forQueue('abc123');
    const locked = await QueueCrypto.forQueue('abc123', 'secret');
    const wrong = await QueueCrypto.forQueue('abc123', 'guess');
    expect(locked.topic).not.toBe(plain.topic);
    expect(locked.topic).toMatch(/\/[0-9a-f]{32}$/);
    expect(wrong.topic).not.toBe(locked.topic);

    const sealed = await locked.encrypt({ door: 1 });
    expect(await (await QueueCrypto.forQueue('abc123', 'secret')).decrypt(sealed)).toEqual({ door: 1 });
    expect(await wrong.decrypt(sealed)).toBeNull();
    expect(await plain.decrypt(sealed)).toBeNull();
  });
});
