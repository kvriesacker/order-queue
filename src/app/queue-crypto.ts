const encoder = new TextEncoder();

/**
 * End-to-end encryption for one queue. The key and the document id are both derived
 * from the queue id, which only people with the link know, and the queue password.
 */
export class QueueCrypto {
  private constructor(
    readonly topic: string,
    private key: CryptoKey,
  ) {}

  /**
   * With a password, the key and the document id come from the id and the password together
   * (slowly, so passwords can't be guessed quickly): the link alone then can't find, read or
   * change the queue.
   */
  static async forQueue(id: string, password?: string): Promise<QueueCrypto> {
    if (password) {
      const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
        'deriveBits',
      ]);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`pizza-queue-lock:${id}`), iterations: 200_000 },
        base,
        512,
      );
      const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      return new QueueCrypto(`pizza-queue/v2/${toHex(bits.slice(0, 16))}`, key);
    }
    const topicHash = await sha256(`pizza-queue-topic:${id}`);
    const keyBytes = await sha256(`pizza-queue-key:${id}`);
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    return new QueueCrypto(`pizza-queue/v1/${toHex(topicHash).slice(0, 32)}`, key);
  }

  async encrypt(value: unknown): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = encoder.encode(JSON.stringify(value));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, data),
    );
    const out = new Uint8Array(iv.length + sealed.length);
    out.set(iv);
    out.set(sealed, iv.length);
    return toBase64(out);
  }

  /** Returns null for anything that isn't a valid message for this queue. */
  async decrypt<T>(payload: string): Promise<T | null> {
    try {
      const bytes = fromBase64(payload);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        this.key,
        bytes.slice(12),
      );
      return JSON.parse(new TextDecoder().decode(plain)) as T;
    } catch {
      return null;
    }
  }
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(text));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
