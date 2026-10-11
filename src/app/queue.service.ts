import { Injectable, computed, signal, untracked } from '@angular/core';
import mqtt, { type MqttClient } from 'mqtt';
import {
  MenuItem,
  NewOrderItem,
  Order,
  QueueAction,
  QueueState,
  applyAction,
  PizzaStatus,
  Timing,
  normalizeState,
  outranks,
  pizzasLeft,
  typeLeft,
  typeMade,
  leftChange,
  randomId,
} from './models';
import { QueueCrypto } from './queue-crypto';
import { estimateReady } from './estimate';
import { OrderTrack, TRACK_AFTER_DONE, orderTrack, trackCrypto } from './tracking';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

/**
 * What an order taker is doing right now, for the screen facing the customer: the order
 * being taken (with the id it will get, so its QR code works before it's sent) and the
 * order just sent.
 */
export interface OrderDraft {
  /** Which order point (order taker's tab) this comes from. */
  pos: string;
  /** The id the order being taken will get. */
  orderId: string;
  customer: string;
  /** Each pizza with its price in euros (0 when the queue has no prices). */
  pizzas: { name: string; color: string; price?: number }[];
  /** The order this order point sent last. */
  sentId: string;
  /** Keep showing the QR code of the order just sent. */
  showQr: boolean;
  at: number;
}

const HOST_KEY = (id: string) => `pizza-queue:host:${id}`;
/** A staff device's copy of the queue, so it can take over when the host is gone. */
const COPY_KEY = (id: string) => `pizza-queue:copy:${id}`;
/** Finished orders cleared from the live queue, kept on each device for the statistics. */
const ARCHIVE_KEY = (id: string) => `pizza-queue:archive:${id}`;
const ARCHIVE_MAX = 3000;
/** How long a starting host listens for a newer host before publishing anything. */
const HOST_GATE_MS = 1500;
/** How long a device that wants to take over waits for competing claims. */
const CLAIM_MS = 2500;
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
  /** Finished orders no longer in the live queue, so statistics cover the whole event. */
  readonly archive = signal<Order[]>([]);
  /** True while this device is trying to take over as host. */
  readonly takingOver = signal(false);
  /** The latest draft from each order point, for the customer's order screen. */
  readonly drafts = signal<ReadonlyMap<string, OrderDraft>>(new Map());
  private draftChannel: BroadcastChannel | null = null;
  /** Ids of orders this device sent that were refused because too few pizzas were left. */
  readonly refused = signal<ReadonlySet<string>>(new Set());
  /** Ticks every 15 seconds so "x min ago" labels stay fresh. */
  readonly now = signal(Date.now());

  /** The latest queue as published by the host (or owned by this browser when hosting). */
  private readonly confirmed = signal<QueueState | null>(null);
  /** A guest's actions the host hasn't confirmed yet. */
  private readonly pending = signal<QueueAction[]>([]);

  /** The queue with this guest's unconfirmed changes applied, so taps show at once. */
  readonly state = computed(() => {
    const state = this.confirmed();
    if (!state) return null;
    return this.pending().reduce((s, a) => (a.type === 'add' ? s : applyAction(s, a)), state);
  });
  readonly orders = computed(() => this.state()?.orders ?? []);
  /** Pizzas that can still be sold, counting this device's unsent orders; null without a limit. */
  readonly pizzasLeft = computed(() => {
    const state = this.state();
    const left = state ? pizzasLeft(state) : null;
    if (left === null) return null;
    const unsent = this.pending()
      .filter((a) => a.type === 'add')
      .reduce((n, a) => n + a.items.reduce((m, i) => m + i.qty, 0), 0);
    return Math.max(0, left - unsent);
  });
  /**
   * Pizzas of each menu type that can still be sold, counting this device's unsent orders:
   * 0 when sold out, null when the type has no maximum.
   */
  readonly typeLeft = computed(() => {
    const state = this.state();
    const left = new Map<string, number | null>();
    if (!state) return left;
    const unsent = this.pending().flatMap((a) => (a.type === 'add' ? a.items : []));
    for (const m of state.menu) {
      const n = typeLeft(state, m.name);
      const mine = unsent.reduce((sum, i) => sum + (i.name === m.name ? i.qty : 0), 0);
      left.set(m.name, n === null ? null : Math.max(0, n - mine));
    }
    return left;
  });
  /** Estimated ready time per open order id; refreshes as the clock ticks. */
  readonly estimates = computed(() => {
    const state = this.state();
    return state ? estimateReady(state, this.now()) : new Map<string, number>();
  });

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
  /** A host only publishes once it's sure no newer host exists (see connectAs). */
  private hostReady = false;
  /** Set right after winning a takeover: the newest queue is known, so announce at once. */
  private justTookOver = false;
  private gateTimer: ReturnType<typeof setTimeout> | undefined;
  /** This device's attempt to take over, and the competing claims it heard. */
  private claim: { epoch: number; id: string; seen: Claim[]; aborted: boolean } | null = null;

  /** Per order id: the tracking info last published for customers' phones. */
  private tracked = new Map<string, string>();
  private trackKeys = new Map<string, Promise<QueueCrypto>>();

  constructor() {
    // Another window of this browser hosting the queue (such as the Orders tab next to the
    // customer screen) saves every change; follow it even without internet.
    window.addEventListener('storage', (e) => {
      if (this.isHost() || !this.queueId || e.key !== HOST_KEY(this.queueId) || !e.newValue) return;
      try {
        const next = normalizeState(JSON.parse(e.newValue) as QueueState);
        const mine = this.confirmed();
        if (mine && next.hostEpoch < mine.hostEpoch) return;
        this.confirmed.set(next);
      } catch {
        // Not a queue; ignore.
      }
    });
    setInterval(() => {
      this.now.set(Date.now());
      this.publishTracking();
    }, 15000);
  }

  /** Creates a new queue hosted by this browser and returns its id. */
  create(name: string, menu: MenuItem[], timing: Timing): string {
    const id = randomId(10);
    const state: QueueState = {
      id,
      name: name.trim() || 'Pizza queue',
      nextNumber: 1,
      menu,
      timing,
      orders: [],
      soldCleared: 0,
      soldClearedByType: {},
      ovensOut: [],
      hostEpoch: 0,
      hostId: randomId(12),
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

    // Staff devices keep a copy, so the queue shows (and can be taken over) even offline.
    this.confirmed.set(this.loadHostState(id) ?? this.loadCopy(id));
    this.archive.set(this.loadArchive(id));
    // A customer screen in another window of this browser gets drafts even offline.
    if (typeof BroadcastChannel !== 'undefined') {
      this.draftChannel = new BroadcastChannel(`pizza-queue-draft-${id}`);
      this.draftChannel.onmessage = (e) => this.receiveDraft(e.data as OrderDraft);
    }
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

  /** Adds an order and returns its id (given ahead when its QR code was already shown). */
  addOrder(customer: string, items: NewOrderItem[], note: string, id = randomId(10)): string {
    this.dispatch({ type: 'add', id, customer, items, note });
    return id;
  }

  /**
   * Makes this device the host when the host's device is gone. Every device that tries
   * announces a claim and listens for others; only the strongest claim wins, so exactly
   * one device hosts and order numbers and the pizza limit stay right. Returns whether
   * this device became the host.
   */
  async takeOver(): Promise<boolean> {
    const state = this.confirmed();
    const crypto = this.crypto;
    const client = this.client;
    const id = this.queueId;
    if (!state || !crypto || !client?.connected || this.isHost() || this.claim) return false;
    if (this.hostOnline() !== false) return false;
    const claim = { epoch: state.hostEpoch + 1, id: randomId(12), seen: [] as Claim[], aborted: false };
    this.claim = claim;
    this.takingOver.set(true);
    client.publish(this.topic('claim'), await crypto.encrypt({ epoch: claim.epoch, id: claim.id }), {
      qos: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, CLAIM_MS));
    this.claim = null;
    this.takingOver.set(false);
    const beaten = claim.seen.some(
      (c) => c.epoch > claim.epoch || (c.epoch === claim.epoch && c.id < claim.id),
    );
    if (claim.aborted || beaten || id !== this.queueId) return false;

    // Won: host the latest queue, including this device's own unsent changes.
    let next = this.confirmed() ?? state;
    for (const action of this.pending()) {
      const after = applyAction(next, action);
      if (after === next && action.type === 'add') this.refuse(action.id);
      next = after;
    }
    next = { ...next, hostEpoch: claim.epoch, hostId: claim.id };
    localStorage.setItem(HOST_KEY(id), JSON.stringify(next));
    localStorage.removeItem(COPY_KEY(id));
    this.confirmed.set(next);
    this.pending.set([]);
    this.justTookOver = true;
    this.claimHost(id);
    return true;
  }

  setMenu(menu: MenuItem[]): void {
    if (this.isHost()) this.applyAsHost({ type: 'menu', menu });
  }

  setTiming(timing: Timing): void {
    if (this.isHost()) this.applyAsHost({ type: 'timing', timing });
  }

  /** Changes one pizza type's maximum or sold-out mark; anyone on staff (the kitchen) may. */
  setTypeLimit(name: string, change: { max?: number; soldOut?: boolean }): void {
    this.dispatch({ type: 'type-limit', name, ...change });
  }

  /**
   * Sets how many of one pizza the kitchen can still make (null: no limit); ordered pizzas
   * it hasn't prepared yet count as part of that.
   */
  setTypeLeft(name: string, left: number | null): void {
    const state = this.state();
    if (state) this.setTypeLimit(name, leftChange(typeMade(state, name), left));
  }

  /** Marks one oven out of order (or working again); the oven station may. */
  setOvenOut(index: number, out: boolean): void {
    this.dispatch({ type: 'oven', index, out });
  }

  setPizza(order: Order, item: number, unit: number, status: PizzaStatus): void {
    this.dispatch({ type: 'pizza', id: order.id, item, unit, status });
  }

  setStatus(order: Order, status: Order['status']): void {
    this.dispatch({ type: 'status', id: order.id, status });
  }

  /** Shares what an order taker is doing with the customer's order screen. */
  publishDraft(draft: OrderDraft): void {
    // Called from an effect: reading the drafts here mustn't make it run again.
    untracked(() => this.receiveDraft(draft));
    this.draftChannel?.postMessage(draft);
    this.outbox = this.outbox.then(async () => {
      const crypto = this.crypto;
      const client = this.client;
      if (!crypto || !client?.connected) return;
      const payload = await crypto.encrypt(draft);
      // Retained, so a screen opened later shows the order straight away.
      client.publish(`${this.topic('draft')}/${draft.pos}`, payload, { qos: 0, retain: true });
    });
  }

  private receiveDraft(draft: OrderDraft): void {
    if (!draft?.pos || !Array.isArray(draft.pizzas)) return;
    const known = this.drafts().get(draft.pos);
    if (known && known.at > draft.at) return;
    this.drafts.update((m) => new Map(m).set(draft.pos, draft));
  }

  shareLink(id = this.queueId): string {
    return `${appBase()}#/q/${id}`;
  }

  /** The link a customer scans to follow one order (it doesn't give access to the queue). */
  trackLink(orderId: string): string {
    return `${appBase()}#/track/${orderId}`;
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
    this.archive.set([]);
    this.pending.set([]);
    this.isHost.set(false);
    this.hostOnline.set(null);
    this.guestCount.set(0);
    this.connection.set('idle');
    this.tracked.clear();
    this.trackKeys.clear();
    this.claim = null;
    this.takingOver.set(false);
    this.draftChannel?.close();
    this.draftChannel = null;
    this.drafts.set(new Map());
  }

  /**
   * Only one tab per browser may host a queue. The Web Locks API makes the other tabs
   * wait as guests, and the next one takes over when the hosting tab closes.
   */
  private claimHost(id: string): void {
    const become = (): boolean => {
      if (id !== this.queueId) return false;
      // Another tab may have handed hosting to a newer device in the meantime.
      let saved = this.loadHostState(id);
      if (!saved) return false;
      if (!saved.hostId) {
        // Saved by a version from before takeovers: give this host an id.
        saved = { ...saved, hostId: randomId(12) };
        localStorage.setItem(HOST_KEY(id), JSON.stringify(saved));
      }
      this.confirmed.set(saved);
      this.pending.set([]);
      this.connectAs(true);
      return true;
    };
    if (!navigator.locks) {
      become();
      return;
    }
    this.lockAbort = new AbortController();
    navigator.locks
      .request(`pizza-queue-host-${id}`, { signal: this.lockAbort.signal }, () => {
        if (!become()) return;
        return new Promise<void>((resolve) => (this.releaseHostLock = resolve));
      })
      .catch(() => {
        // Aborted because this tab switched queues.
      });
  }

  // ---- MQTT connection ----

  private topic(name: 'state' | 'actions' | 'host' | 'presence' | 'claim' | 'draft'): string {
    return `${this.crypto!.topic}/${name}`;
  }

  private connectAs(host: boolean): void {
    this.disconnect();
    this.isHost.set(host);
    this.hostReady = false;
    this.connection.set('connecting');
    const hostId = host ? this.confirmed()!.hostId : '';
    const client = mqtt.connect(brokerUrl(), {
      clientId: `pq-${this.clientId}`,
      clean: true,
      keepalive: 30,
      connectTimeout: 10000,
      reconnectPeriod: 2000,
      // Tells guests when the host's browser drops off.
      will: host
        ? { topic: this.topic('host'), payload: `0:${hostId}`, qos: 1, retain: true }
        : undefined,
    });
    this.client = client;

    client.on('connect', () => {
      if (client !== this.client) return;
      this.connection.set('online');
      client.subscribe([this.topic('state'), this.topic('host'), this.topic('claim')], { qos: 1 });
      client.subscribe(`${this.topic('draft')}/+`, { qos: 0 });
      if (!host) {
        this.announce();
        return;
      }
      // Before publishing, listen briefly: if another device took over while this one was
      // away, its newer queue arrives and this device steps down instead of overwriting it.
      this.hostReady = false;
      clearTimeout(this.gateTimer);
      // A device that just won a takeover announces itself straight away, so anyone
      // claiming a moment later backs off.
      const gate = this.justTookOver ? 0 : HOST_GATE_MS;
      this.justTookOver = false;
      this.gateTimer = setTimeout(() => {
        if (client !== this.client || !this.isHost()) return;
        this.hostReady = true;
        client.subscribe([this.topic('actions'), this.topic('presence')], { qos: 1 });
        this.announceHost();
        this.publishState();
        this.tracked.clear();
        this.publishTracking();
      }, gate);
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
    clearTimeout(this.gateTimer);
    const client = this.client;
    this.client = null;
    if (!client) return;
    // A host leaving on purpose (switching queue) clears its online flag itself.
    if (this.isHost() && this.hostReady && client.connected) {
      const payload = `0:${this.confirmed()?.hostId ?? ''}`;
      client.publish(this.topic('host'), payload, { qos: 1, retain: true }, () => client.end());
    } else {
      client.end(true);
    }
  }

  private async onMessage(topic: string, payload: string): Promise<void> {
    const crypto = this.crypto;
    if (!crypto) return;
    if (topic.startsWith(`${this.topic('draft')}/`)) {
      const draft = await crypto.decrypt<OrderDraft>(payload);
      if (draft && crypto === this.crypto) this.receiveDraft(draft);
      return;
    }
    switch (topic) {
      case this.topic('host'): {
        // "1:<host id>" while a host is connected, "0:<host id>" once it's gone.
        const [flag, hostId = ''] = payload.split(':');
        const online = flag === '1';
        if (this.isHost()) {
          // Someone else's message (such as an old host's "gone" notice) replaced ours.
          if (this.hostReady && payload !== `1:${this.confirmed()?.hostId}`) this.announceHost();
          break;
        }
        if (online && this.claim) this.claim.aborted = true;
        // An old host dropping off after a takeover says nothing about the current host.
        const current = this.confirmed()?.hostId;
        if (!online && hostId && current && hostId !== current) break;
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
        if (!state || crypto !== this.crypto) return;
        const next = normalizeState(state);
        const mine = this.confirmed();
        if (this.isHost()) {
          // A newer host took over: step down and follow it.
          if (mine && outranks(next, mine)) this.stepDown(next);
          return;
        }
        if (this.claim && next.hostEpoch >= this.claim.epoch) this.claim.aborted = true;
        // Ignore an old host's queue once a newer one is known.
        if (mine && next.hostEpoch < mine.hostEpoch) return;
        if (mine) this.archiveDropped(mine, next);
        this.confirmed.set(next);
        this.saveCopy(next);
        // An order the host can't accept (too few pizzas left) won't ever arrive; drop it.
        for (const a of this.pending()) {
          if (a.type === 'add' && !isReflected(next, a) && applyAction(next, a) === next)
            this.refuse(a.id);
        }
        const refused = this.refused();
        this.pending.update((p) =>
          p.filter((a) => !isReflected(next, a) && !(a.type === 'add' && refused.has(a.id))),
        );
        break;
      }
      case this.topic('claim'): {
        const claim = await crypto.decrypt<Claim>(payload);
        if (!claim || crypto !== this.crypto) return;
        this.claim?.seen.push(claim);
        // The host is still here: say so, which makes the claiming device back off.
        if (this.isHost() && this.hostReady) this.announceHost();
        break;
      }
      case this.topic('actions'): {
        const action = await crypto.decrypt<QueueAction>(payload);
        // Only the host itself may change the menu and timing.
        const hostOnly = action?.type === 'menu' || action?.type === 'timing';
        if (action && !hostOnly && this.isHost() && crypto === this.crypto)
          this.applyAsHost(action);
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
    if (next === state) {
      if (action.type === 'add' && !state.orders.some((o) => o.id === action.id))
        this.refuse(action.id);
      return;
    }
    this.archiveDropped(state, next);
    this.confirmed.set(next);
    localStorage.setItem(HOST_KEY(next.id), JSON.stringify(next));
    this.publishState();
    this.publishTracking();
  }

  /** Keeps orders that the queue clears (old picked-up ones) for the statistics. */
  private archiveDropped(before: QueueState, after: QueueState): void {
    const kept = new Set(after.orders.map((o) => o.id));
    const dropped = before.orders.filter((o) => !kept.has(o.id));
    if (!dropped.length) return;
    const known = new Set(this.archive().map((o) => o.id));
    const archive = [...this.archive(), ...dropped.filter((o) => !known.has(o.id))].slice(
      -ARCHIVE_MAX,
    );
    this.archive.set(archive);
    try {
      localStorage.setItem(ARCHIVE_KEY(after.id), JSON.stringify(archive));
    } catch {
      // Storage full; statistics then only cover the live queue.
    }
  }

  private loadArchive(id: string): Order[] {
    try {
      const saved = JSON.parse(localStorage.getItem(ARCHIVE_KEY(id)) ?? '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  /**
   * Publishes each order's status and estimate for customers following it on their phone,
   * only when something they'd see changed, and clears orders nobody needs to follow.
   */
  private publishTracking(): void {
    const state = this.confirmed();
    const client = this.client;
    if (!state || !client?.connected || !this.isHost() || !this.hostReady) return;
    const now = Date.now();
    const etas = estimateReady(state, now);
    const followed = state.orders.filter(
      (o) =>
        !(o.status === 'collected' || o.status === 'cancelled') ||
        now - o.updatedAt < TRACK_AFTER_DONE,
    );
    const updates: [string, OrderTrack | null][] = followed.map((o) => [
      o.id,
      orderTrack(state, o, etas.get(o.id)),
    ]);
    for (const id of this.tracked.keys()) {
      if (!followed.some((o) => o.id === id)) updates.push([id, null]);
    }
    for (const [id, track] of updates) {
      const json = JSON.stringify(track);
      if (this.tracked.get(id) === json) continue;
      if (track) this.tracked.set(id, json);
      else this.tracked.delete(id);
      if (!this.trackKeys.has(id)) this.trackKeys.set(id, trackCrypto(id));
      const key = this.trackKeys.get(id)!;
      this.outbox = this.outbox.then(async () => {
        const crypto = await key;
        // An empty retained message removes the order from the broker.
        const payload = track ? await crypto.encrypt(track) : '';
        client.publish(`${crypto.topic}/order`, payload, { qos: 1, retain: true });
      });
      if (!track) this.trackKeys.delete(id);
    }
  }

  private announceHost(): void {
    const hostId = this.confirmed()?.hostId ?? '';
    this.client?.publish(this.topic('host'), `1:${hostId}`, { qos: 1, retain: true });
  }

  /** Another device hosts now: keep this queue only as a copy and join as staff. */
  private stepDown(newer: QueueState): void {
    const id = this.queueId;
    this.isHost.set(false);
    localStorage.removeItem(HOST_KEY(id));
    this.saveCopy(newer);
    this.confirmed.set(newer);
    this.connectAs(false);
    this.releaseHostLock?.();
    this.releaseHostLock = null;
  }

  private saveCopy(state: QueueState): void {
    try {
      localStorage.setItem(COPY_KEY(state.id), JSON.stringify(state));
    } catch {
      // Storage full or blocked; the copy is only a fallback.
    }
  }

  private loadCopy(id: string): QueueState | null {
    try {
      const raw = localStorage.getItem(COPY_KEY(id));
      return raw ? normalizeState(JSON.parse(raw) as QueueState) : null;
    } catch {
      return null;
    }
  }

  private refuse(orderId: string): void {
    this.refused.update((s) => new Set(s).add(orderId));
  }

  private publishState(): void {
    this.outbox = this.outbox.then(async () => {
      const state = this.confirmed();
      const crypto = this.crypto;
      if (!state || !crypto || !this.isHost() || !this.hostReady) return;
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
      return raw ? normalizeState(JSON.parse(raw) as QueueState) : null;
    } catch {
      return null;
    }
  }
}

interface Claim {
  epoch: number;
  id: string;
}

function isReflected(state: QueueState, action: QueueAction): boolean {
  if (action.type === 'menu' || action.type === 'timing') return true;
  if (action.type === 'oven')
    return action.index >= state.timing.ovens || state.ovensOut.includes(action.index) === action.out;
  if (action.type === 'type-limit') {
    const item = state.menu.find((m) => m.name === action.name);
    return (
      !item ||
      ((action.max === undefined || (item.max ?? 0) === action.max) &&
        (action.soldOut === undefined || !!item.soldOut === action.soldOut))
    );
  }
  const order = state.orders.find((o) => o.id === action.id);
  if (action.type === 'add') return !!order;
  if (action.type === 'pizza') {
    const unit = order?.items[action.item]?.units[action.unit];
    return !unit || unit === action.status;
  }
  return !order || order.status === action.status;
}

/** The MQTT broker every device connects to. */
export function brokerUrl(): string {
  return BROKER_OVERRIDE ?? DEFAULT_BROKER;
}

/** This app's address, keeping a broker override so links work in local tests too. */
function appBase(): string {
  const { origin, pathname } = window.location;
  const search = BROKER_OVERRIDE ? `?broker=${encodeURIComponent(BROKER_OVERRIDE)}` : '';
  return `${origin}${pathname}${search}`;
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
