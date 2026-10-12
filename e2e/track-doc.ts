import { QueueCrypto } from '../src/app/queue-crypto';

const FIRESTORE = 'http://127.0.0.1:8085/v1/projects/demo-pizza-queue/databases/(default)/documents';

/**
 * What the follow app would show for an order: its document in the local Firestore emulator,
 * decrypted the way the follow app does. Null while there is none. The emulator's admin token
 * skips the rules, as a test should.
 */
export async function savedTrack(orderId: string): Promise<Record<string, unknown> | null> {
  const crypto = await QueueCrypto.forQueue(`track:${orderId}`);
  const id = crypto.topic.slice(crypto.topic.lastIndexOf('/') + 1);
  const response = await fetch(`${FIRESTORE}/tracks/${id}`, { headers: { authorization: 'Bearer owner' } });
  if (!response.ok) return null;
  const data = (await response.json()).fields?.data?.stringValue;
  return typeof data === 'string' ? crypto.decrypt(data) : null;
}
