import { Injectable, computed, signal } from '@angular/core';
import mqtt, { type MqttClient } from 'mqtt';
import { Order, QueueAction, QueueState, applyAction, randomId } from './models';
import { QueueCrypto } from './queue-crypto';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

const HOST_KEY = (id: string) => `pizza-queue:host:${id}`;
const DEFAULT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const PRESENCE_MS = 20000;

/**
 * Keeps one pizza queue in sync between browsers through a public MQTT broker over a
 * secure WebSocket, which works on any network (no peer-to-peer connection needed).
 *
 * The browser that created the queue is the host: it owns the state, saves it in
 * localStorage, applies every change and publishes the full queue as a retained message.
 * Other browsers send it actions. Everything is end-to-end encrypted with a key derived
 * from the queue id in the link, so the broker only sees a hashed topic and ciphertext.
 */
@Injectable({ providedIn: 'root' })
export class QueueService {
  readonly connection = signal<ConnectionState>('idle');
  readonly isHost = signal(false);
  /** For guests: whether the host's browser is connected (null until known). */
  readonly hostOnline = signal<boolean | null>(null);
  readonly guestCount = signal(0);
  /** Ticks every 15 seconds so "x min ago" labels stay fresh. */
  readonly now = signal(Date.now());

  /** The latest queue as published by the host (or owned by this browser when hosting). */
  private readonly confirmed = signal<QueueState | null>(null);
  /** A guest's actions the host hasn't confirmed yet. */
  private readonly pending = signal<QueueAction[]>([]);

  /** The queue with this guest's unconfirmed status changes applied, so taps show at once. */
  readonly state = computed(() => {
    const state = this.confirmed();
    if (!state) return null;
    return this.pending().reduce((s, a) => (a.type === 'status' ? applyAction(s, a) : s), state);
  });
  readonly orders = computed(() => this.state()?.orders ?? []);

  private queueId = '';
  private crypto: QueueCrypto | null = null;
  private client: MqttClient | null = null;
  private clientId = randomId(12);
  private seen = new Map<string, number>();
  private presenceTimer: ReturnType<typeof setInterval> | undefined;
  private releaseHostLock: (() => void) | null = null;
  private lockAbort: AbortController | null = null;
  /** Encryption is async; these keep incoming and outgoing messages in order. */
  private inbox = Promise.resolve();
  private outbox = Promise.resolve();

  constructor() {
    setInterval(() => this.now.set(Date.now()), 15000);
  }

  /** Creates a new queue hosted by this browser and returns its id. */
  create(name: string): string {
    const id = randomId(10);
    const state: QueueState = {
      id,
      name: name.trim() || 'Pizza queue',
      nextNumber: 1,
      orders: [],
    };
    localStorage.setItem(HOST_KEY(id), JSON.stringify(state));
    return id;
  }

  /** Connects to a queue, as host when this browser created it, otherwise as guest. */
  async open(id: string): Promise<void> {
    if (id === this.queueId) return;
    this.close();
    this.queueId = id;
    this.crypto = await QueueCrypto.forQueue(id);
    if (id !== this.queueId) return;

    this.confirmed.set(this.loadHostState(id));
    this.connectAs(false);
    if (this.loadHostState(id)) this.claimHost(id);
  }

  dispatch(action: QueueAction): void {
    if (this.isHost()) {
      this.applyAsHost(action);
      return;
    }
    this.pending.update((p) => [...p, action]);
    this.publishAction(action);
  }

  /** Adds an order and returns its id. */
  addOrder(customer: string, items: Order['items'], note: string): string {
    const id = randomId(10);
    this.dispatch({ type: 'add', id, customer, items, note });
    return id;
  }

  setStatus(order: Order, status: Order['status']): void {
    this.dispatch({ type: 'status', id: order.id, status });
  }

  shareLink(id = this.queueId): string {
    const { origin, pathname } = window.location;
    const search = BROKER_OVERRIDE ? `?broker=${encodeURIComponent(BROKER_OVERRIDE)}` : '';
    return `${origin}${pathname}${search}#/q/${id}`;
  }

  private close(): void {
    this.lockAbort?.abort();
    this.lockAbort = null;
    this.releaseHostLock?.();
    this.releaseHostLock = null;
    this.disconnect();
    this.queueId = '';
    this.crypto = null;
    this.confirmed.set(null);
    this.pending.set([]);
    this.isHost.set(false);
    this.hostOnline.set(null);
    this.guestCount.set(0);
    this.connection.set('idle');
  }

  /**
   * Only one tab per browser may host a queue. The Web Locks API makes the other tabs
   * wait as guests, and the next one takes over when the hosting tab closes.
   */
  private claimHost(id: string): void {
    const become = () => {
      if (id !== this.queueId) return;
      const saved = this.loadHostState(id);
      if (saved) this.confirmed.set(saved);
      this.pending.set([]);
      this.connectAs(true);
    };
    if (!navigator.locks) {
      become();
      return;
    }
    this.lockAbort = new AbortController();
    navigator.locks
      .request(`pizza-queue-host-${id}`, { signal: this.lockAbort.signal }, () => {
        become();
        return new Promise<void>((resolve) => (this.releaseHostLock = resolve));
      })
      .catch(() => {
        // Aborted because this tab switched queues.
      });
  }

  // ---- MQTT connection ----

  private topic(name: 'state' | 'actions' | 'host' | 'presence'): string {
    return `${this.crypto!.topic}/${name}`;
  }

  private connectAs(host: boolean): void {
    this.disconnect();
    this.isHost.set(host);
    this.connection.set('connecting');
    const client = mqtt.connect(BROKER_OVERRIDE ?? DEFAULT_BROKER, {
      clientId: `pq-${this.clientId}`,
      clean: true,
      keepalive: 30,
      connectTimeout: 10000,
      reconnectPeriod: 2000,
      // Tells guests when the host's browser drops off.
      will: host ? { topic: this.topic('host'), payload: '0', qos: 1, retain: true } : undefined,
    });
    this.client = client;

    client.on('connect', () => {
      if (client !== this.client) return;
      this.connection.set('online');
      const topics = host
        ? [this.topic('actions'), this.topic('presence')]
        : [this.topic('state'), this.topic('host')];
      client.subscribe(topics, { qos: 1 });
      if (host) {
        client.publish(this.topic('host'), '1', { qos: 1, retain: true });
        this.publishState();
      } else {
        this.announce();
      }
    });
    client.on('message', (topic, payload) => {
      if (client !== this.client) return;
      const text = payload.toString();
      this.inbox = this.inbox.then(() => this.onMessage(topic, text));
    });
    client.on('offline', () => client === this.client && this.connection.set('offline'));
    client.on('reconnect', () => client === this.client && this.connection.set('connecting'));
    client.on('error', () => client === this.client && this.connection.set('offline'));

    this.presenceTimer = setInterval(() => {
      if (host) this.countGuests();
      else this.announce();
    }, PRESENCE_MS);
  }

  private disconnect(): void {
    clearInterval(this.presenceTimer);
    const client = this.client;
    this.client = null;
    if (!client) return;
    // A host leaving on purpose (switching queue) clears its online flag itself.
    if (this.isHost() && client.connected) {
      client.publish(this.topic('host'), '0', { qos: 1, retain: true }, () => client.end());
    } else {
      client.end(true);
    }
  }

  private async onMessage(topic: string, payload: string): Promise<void> {
    const crypto = this.crypto;
    if (!crypto) return;
    switch (topic) {
      case this.topic('host'): {
        const online = payload === '1';
        const wasOnline = this.hostOnline() === true;
        this.hostOnline.set(online);
        // The host may have missed actions sent while it was away; send them again.
        if (online && !wasOnline) {
          this.announce();
          this.pending().forEach((a) => this.publishAction(a));
        }
        break;
      }
      case this.topic('presence'):
        this.seen.set(payload, Date.now());
        this.countGuests();
        break;
      case this.topic('state'): {
        const state = await crypto.decrypt<QueueState>(payload);
        if (!state || this.isHost() || crypto !== this.crypto) return;
        this.confirmed.set(state);
        this.pending.update((p) => p.filter((a) => !isReflected(state, a)));
        break;
      }
      case this.topic('actions'): {
        const action = await crypto.decrypt<QueueAction>(payload);
        if (action && this.isHost() && crypto === this.crypto) this.applyAsHost(action);
        break;
      }
    }
  }

  private applyAsHost(action: QueueAction): void {
    const state = this.confirmed();
    if (!state) return;
    let next: QueueState;
    try {
      next = applyAction(state, action);
    } catch {
      return; // Malformed action.
    }
    if (next === state) return;
    this.confirmed.set(next);
    localStorage.setItem(HOST_KEY(next.id), JSON.stringify(next));
    this.publishState();
  }

  private publishState(): void {
    this.outbox = this.outbox.then(async () => {
      const state = this.confirmed();
      const crypto = this.crypto;
      if (!state || !crypto || !this.isHost()) return;
      const payload = await crypto.encrypt(state);
      // Retained, so anyone who opens the link gets the latest queue straight away.
      this.client?.publish(this.topic('state'), payload, { qos: 1, retain: true });
    });
  }

  private publishAction(action: QueueAction): void {
    this.outbox = this.outbox.then(async () => {
      const crypto = this.crypto;
      if (!crypto) return;
      const payload = await crypto.encrypt(action);
      // Queued by the MQTT client while offline and sent when it reconnects.
      this.client?.publish(this.topic('actions'), payload, { qos: 1 });
    });
  }

  private announce(): void {
    if (this.client?.connected) this.client.publish(this.topic('presence'), this.clientId);
  }

  private countGuests(): void {
    const cutoff = Date.now() - PRESENCE_MS * 2.5;
    for (const [id, at] of this.seen) if (at < cutoff) this.seen.delete(id);
    this.guestCount.set(this.seen.size);
  }

  private loadHostState(id: string): QueueState | null {
    try {
      const raw = localStorage.getItem(HOST_KEY(id));
      return raw ? (JSON.parse(raw) as QueueState) : null;
    } catch {
      return null;
    }
  }
}

function isReflected(state: QueueState, action: QueueAction): boolean {
  const order = state.orders.find((o) => o.id === action.id);
  if (action.type === 'add') return !!order;
  return !order || order.status === action.status;
}

/**
 * `?broker=wss://host:port/path` in the page URL uses another MQTT broker (handy for
 * local testing). Remembered per tab, because the router drops the query string.
 */
const BROKER_OVERRIDE = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('broker');
    if (fromUrl) sessionStorage.setItem('pizza-queue:broker', fromUrl);
    return fromUrl ?? sessionStorage.getItem('pizza-queue:broker');
  } catch {
    return null;
  }
})();
