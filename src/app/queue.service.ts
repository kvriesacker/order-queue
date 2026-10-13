import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import {
  DocumentSnapshot,
  Firestore,
  FirestoreError,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
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
  pizzasLeft,
  typeLeft,
  typeMade,
  leftChange,
  randomId,
  Sponsor,
  cleanOrderNumber,
} from './models';
import { QueueCrypto } from './queue-crypto';
import { estimateReady } from './estimate';
import { OrderTrack, trackCrypto } from './tracking';
import { FOLLOW_OVERRIDE, followLink } from './follow-app';
import { EMULATOR_HOST, firestore } from './firebase';
import { settle, trackChanges } from './sync';
import { DEFAULT_LANG, Lang, queueLang, t } from './i18n/i18n';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline' | 'no-backend';

/**
 * Whether this device may open the queue: `ask` and `wrong` wait for the queue password,
 * `checking` while finding out whether the queue has one or the password is right.
 */
export type LockState = 'open' | 'checking' | 'ask' | 'wrong';

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

/** The queue password on each staff device that started or joined the queue. */
const PASSWORD_KEY = (id: string) => `pizza-queue:password:${id}`;
/** Each staff device's copy of the queue, so it shows at once and without internet. */
const COPY_KEY = (id: string) => `pizza-queue:copy:${id}`;
/** Saved by the earlier version, where the device that started a queue held it. */
const OLD_HOST_KEY = (id: string) => `pizza-queue:host:${id}`;
/**
 * Changes made in one tab that aren't saved online yet. Per tab, so tabs of one browser
 * (the Orders tab and the customer screen) don't overwrite each other's; a tab that opens
 * the queue later picks up those of tabs that were closed or reloaded.
 */
const PENDING_KEY = (id: string, tab: string) => `pizza-queue:pending:${id}:${tab}`;
/** Held by each open tab, so others can tell which tabs are gone. */
const TAB_LOCK = (tab: string) => `pizza-queue:tab:${tab}`;
/** Finished orders cleared from the live queue, kept on each device for the statistics. */
const ARCHIVE_KEY = (id: string) => `pizza-queue:archive:${id}`;
const ARCHIVE_MAX = 3000;
/** How long to wait before trying to save changes again after a failure. */
const RETRY_MS = 3000;
/** Order points send what they're doing at most this often. */
const DRAFT_DELAY_MS = 300;
/** How often the device that last changed the queue refreshes customers' ready times. */
const TRACK_REFRESH_MS = 60000;

/**
 * Keeps one pizza queue in sync between devices through Firebase (Cloud Firestore).
 *
 * The queue is one document. Every device applies its own changes in a transaction (read
 * the queue, apply the change, write it back), so two order takers at once still get
 * different numbers and the pizza limit holds, and no device has to stay online for the
 * others. Changes made without internet wait on the device and are sent when it's back.
 *
 * Everything is end-to-end encrypted with a key derived from the queue id in the link and the
 * queue password, so Firebase only sees a hashed document id and ciphertext, and someone with
 * only the link can't find the queue.
 */
@Injectable({ providedIn: 'root' })
export class QueueService {
  readonly connection = signal<ConnectionState>('idle');
  readonly lock = signal<LockState>('open');
  /** Finished orders no longer in the live queue, so statistics cover the whole event. */
  readonly archive = signal<Order[]>([]);
  /** The latest draft from each order point, for the customer's order screen. */
  readonly drafts = signal<ReadonlyMap<string, OrderDraft>>(new Map());
  private draftChannel: BroadcastChannel | null = null;
  /** Ids of orders this device sent that were refused because too few pizzas were left. */
  readonly refused = signal<ReadonlySet<string>>(new Set());
  /** Ticks every 15 seconds so "x min ago" labels stay fresh. */
  readonly now = signal(Date.now());

  /** The queue as last saved online (or this device's copy until that arrives). */
  private readonly confirmed = signal<QueueState | null>(null);
  /** This device's changes that aren't saved online yet, oldest first. */
  private readonly pending = signal<QueueAction[]>([]);
  /** How many of this device's changes still wait to be saved online. */
  readonly unsent = computed(() => this.pending().length);

  /** The queue with this device's unsaved changes applied, so taps show at once. */
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
  private password = '';
  private crypto: QueueCrypto | null = null;
  private db: Firestore | null = null;
  private readonly deviceId = randomId(12);
  private stops: (() => void)[] = [];
  /** Decrypting is async; this keeps incoming changes in order. */
  private inbox = Promise.resolve();
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Whether this device made the last change, and so keeps customers' ready times fresh. */
  private lastWriter = false;
  /** Per order id: the tracking info this device last saved for customers' phones. */
  private tracked = new Map<string, string>();
  private trackKeys = new Map<string, Promise<QueueCrypto>>();

  constructor() {
    // Devices that haven't picked a language themselves follow the queue's.
    effect(() => queueLang.set(this.state()?.lang ?? null));
    navigator.locks?.request(TAB_LOCK(this.deviceId), () => new Promise(() => undefined)).catch(() => undefined);
    window.addEventListener('online', () => {
      if (this.queueId && this.connection() === 'offline') this.connection.set('connecting');
      this.flush();
    });
    window.addEventListener('offline', () => {
      if (this.queueId && this.connection() !== 'no-backend') this.connection.set('offline');
    });
    setInterval(() => this.now.set(Date.now()), 15000);
    setInterval(() => this.refreshTracking(), TRACK_REFRESH_MS);
  }

  /**
   * Creates a new queue and returns its id. It's saved online when it opens. Staff joining
   * it need the password as well as the link.
   */
  create(name: string, menu: MenuItem[], timing: Timing, lang: Lang, password: string, firstNumber = 1): string {
    const id = randomId(10);
    const state: QueueState = {
      id,
      name: name.trim() || t('Pizza queue'),
      nextNumber: cleanOrderNumber(firstNumber) ?? 1,
      menu,
      timing,
      orders: [],
      soldCleared: 0,
      soldClearedByType: {},
      ovensOut: [],
      hostEpoch: 0,
      hostId: '',
      lang,
    };
    localStorage.setItem(COPY_KEY(id), JSON.stringify(state));
    localStorage.setItem(PASSWORD_KEY(id), password);
    this.saveDoor(id, password);
    return id;
  }

  /**
   * Removes a queue from this device: its copy, unsent changes and statistics. It stays
   * online for the other devices.
   */
  forget(id: string): void {
    if (id === this.queueId) this.close();
    for (const key of [OLD_HOST_KEY(id), COPY_KEY(id), ARCHIVE_KEY(id), PASSWORD_KEY(id), ...pendingKeys(id)]) {
      localStorage.removeItem(key);
    }
  }

  /**
   * Opens a queue: shows this device's copy at once and follows the one online. A queue with
   * a password waits for it (see `unlock`) unless this device already knows it.
   */
  async open(id: string): Promise<void> {
    if (id === this.queueId) return;
    this.close();
    this.queueId = id;
    const password = savedPassword(id);
    // A queue this device knew before passwords existed has none; skip asking online.
    if (password || this.loadCopy(id)) return this.start(id, password);
    this.lock.set('checking');
    const door = await this.door(id);
    if (id !== this.queueId) return;
    if (door === undefined) return; // No connection: tried again when it's back.
    if (door) this.lock.set('ask');
    else this.start(id, '');
  }

  /** Tries a queue password; opens the queue when it's right. */
  async unlock(password: string): Promise<void> {
    const id = this.queueId;
    if (!id || !password) return;
    this.lock.set('checking');
    const door = await this.door(id);
    if (id !== this.queueId) return;
    if (door === undefined) {
      this.lock.set('ask');
      return;
    }
    const crypto = await QueueCrypto.forQueue(id, password);
    const right = door ? (await crypto.decrypt(door)) !== null : true;
    if (id !== this.queueId) return;
    if (!right) {
      this.lock.set('wrong');
      return;
    }
    try {
      localStorage.setItem(PASSWORD_KEY(id), password);
    } catch {
      // Private mode: asked again next time.
    }
    this.start(id, door ? password : '');
  }

  /**
   * The queue's door: proof of its password, which anyone with the link can read but nobody
   * can change. Null for a queue without a password, undefined when there's no connection.
   */
  private async door(id: string): Promise<string | null | undefined> {
    let db: Firestore;
    try {
      db = await firestore();
    } catch {
      return null; // Without Firebase everything stays on this device.
    }
    try {
      const snap = await getDoc(doc(db, 'doors', docId(await QueueCrypto.forQueue(id))));
      const data = snap.get('data');
      return typeof data === 'string' ? data : null;
    } catch {
      this.connection.set('offline');
      const retry = () => id === this.queueId && this.lock() !== 'open' && this.reopen(id);
      window.addEventListener('online', retry, { once: true });
      return undefined;
    }
  }

  /** The password of the open queue, as this device knows it ('' without one). */
  queuePassword(): string {
    return this.password;
  }

  private async recheckDoor(id: string, tries = 5): Promise<void> {
    const door = await this.door(id);
    if (id !== this.queueId || this.confirmed()) return;
    if (door) this.reopen(id);
    else if (tries > 1) setTimeout(() => this.recheckDoor(id, tries - 1), 2000);
  }

  /**
   * Saves a queue's door unless it's there, so staff joining are asked for the password. Apart
   * from the queue itself, which is saved even when this fails.
   */
  private async saveDoor(id: string, password: string): Promise<void> {
    try {
      const db = await firestore();
      const ref = doc(db, 'doors', docId(await QueueCrypto.forQueue(id)));
      if ((await getDoc(ref)).exists()) return;
      const crypto = await QueueCrypto.forQueue(id, password);
      await setDoc(ref, { data: await crypto.encrypt({ door: 1 }), at: serverTimestamp() });
    } catch {
      // Offline: saved when the queue opens online again.
    }
  }

  private reopen(id: string): void {
    this.queueId = '';
    this.open(id);
  }

  private async start(id: string, password: string): Promise<void> {
    this.lock.set('open');
    this.password = password;
    const crypto = await QueueCrypto.forQueue(id, password);
    const left = await this.adoptPending(id);
    if (id !== this.queueId) return;
    this.crypto = crypto;
    this.confirmed.set(this.loadCopy(id));
    this.archive.set(this.loadArchive(id));
    this.pending.set(left);
    this.savePending();
    // A customer screen in another window of this browser gets drafts even offline.
    if (typeof BroadcastChannel !== 'undefined') {
      this.draftChannel = new BroadcastChannel(`pizza-queue-draft-${id}`);
      this.draftChannel.onmessage = (e) => this.receiveDraft(e.data as OrderDraft);
    }
    this.connection.set(navigator.onLine ? 'connecting' : 'offline');

    let db: Firestore;
    try {
      db = await firestore();
    } catch {
      if (id === this.queueId) this.connection.set('no-backend');
      return;
    }
    if (id !== this.queueId) return;
    this.db = db;
    const ref = this.queueRef();
    this.stops.push(
      onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) => this.receive(() => this.receiveQueue(snap, crypto)),
        () => crypto === this.crypto && this.connection.set('offline'),
      ),
      onSnapshot(collection(ref, 'drafts'), (snap) => {
        for (const change of snap.docChanges()) {
          const data = change.doc.get('data');
          if (typeof data !== 'string') continue;
          this.receive(async () => {
            const draft = await crypto.decrypt<OrderDraft>(data);
            if (draft && crypto === this.crypto) this.receiveDraft(draft);
          });
        }
      }),
    );
    this.flush();
  }

  dispatch(action: QueueAction): void {
    this.pending.update((p) => [...p, action]);
    this.savePending();
    this.flush();
  }

  /** Adds an order and returns its id (given ahead when its QR code was already shown). */
  addOrder(customer: string, items: NewOrderItem[], note: string, id = randomId(10)): string {
    this.dispatch({ type: 'add', id, customer, items, note });
    return id;
  }

  setMenu(menu: MenuItem[]): void {
    this.dispatch({ type: 'menu', menu });
  }

  /** The language devices that join start in, and customer screens speak. */
  setLang(lang: Lang): void {
    this.dispatch({ type: 'lang', lang });
  }

  setTiming(timing: Timing): void {
    this.dispatch({ type: 'timing', timing });
  }

  /** Sets the number the next order gets (to follow a new roll of printed tickets). */
  setNextNumber(number: number): void {
    this.dispatch({ type: 'next-number', number });
  }

  setSponsors(sponsors: Sponsor[], seconds: number): void {
    this.dispatch({ type: 'sponsors', sponsors, seconds });
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

  /** Puts one prepared pizza in an oven (0 is the first), or with null takes it back out. */
  putInOven(order: Order, item: number, unit: number, oven: number | null): void {
    this.dispatch({ type: 'bake', id: order.id, item, unit, oven });
  }

  setPizza(order: Order, item: number, unit: number, status: PizzaStatus): void {
    this.dispatch({ type: 'pizza', id: order.id, item, unit, status });
  }

  /** The counter shows one baked pizza on the customer screen, or takes it off. */
  callPizza(order: Order, item: number, unit: number, called: boolean): void {
    this.dispatch({ type: 'call', id: order.id, item, unit, called });
  }

  /** The counter gives one pizza to the customer, or takes that back. */
  handOver(order: Order, item: number, unit: number, handed: boolean): void {
    this.dispatch({ type: 'hand', id: order.id, item, unit, handed });
  }

  setStatus(order: Order, status: Order['status']): void {
    this.dispatch({ type: 'status', id: order.id, status });
  }

  /** Shares what an order taker is doing with the customer's order screen. */
  publishDraft(draft: OrderDraft): void {
    // Called from an effect: reading the drafts here mustn't make it run again.
    untracked(() => this.receiveDraft(draft));
    this.draftChannel?.postMessage(draft);
    // Saved online (the latest per order point), so a screen on another device follows it.
    clearTimeout(this.draftTimers.get(draft.pos));
    this.draftTimers.set(
      draft.pos,
      setTimeout(async () => {
        this.draftTimers.delete(draft.pos);
        const crypto = this.crypto;
        if (!crypto || !this.db) return;
        const data = await crypto.encrypt(draft);
        if (crypto !== this.crypto) return;
        setDoc(doc(this.queueRef(), 'drafts', draft.pos), { data, at: serverTimestamp() }).catch(
          () => undefined, // A later draft replaces it anyway.
        );
      }, DRAFT_DELAY_MS),
    );
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

  /** The link a customer scans to follow one order, in the follow app (not this one). */
  trackLink(orderId: string): string {
    return followLink(orderId);
  }

  private close(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
    clearTimeout(this.retryTimer);
    this.draftTimers.forEach((t) => clearTimeout(t));
    this.draftTimers.clear();
    this.queueId = '';
    this.password = '';
    this.lock.set('open');
    this.crypto = null;
    this.confirmed.set(null);
    this.archive.set([]);
    this.pending.set([]);
    this.connection.set('idle');
    this.lastWriter = false;
    this.tracked.clear();
    this.trackKeys.clear();
    this.draftChannel?.close();
    this.draftChannel = null;
    this.drafts.set(new Map());
  }

  private queueRef() {
    return doc(this.db!, 'queues', docId(this.crypto!));
  }


  /** Handles incoming changes one at a time, in order; one going wrong doesn't stop the rest. */
  private receive(handle: () => Promise<void>): void {
    this.inbox = this.inbox.then(handle).catch((e) => console.error(e));
  }

  private async receiveQueue(snap: DocumentSnapshot, crypto: QueueCrypto): Promise<void> {
    if (crypto !== this.crypto) return;
    const fromServer = !snap.metadata.fromCache;
    if (fromServer) this.connection.set('online');
    else if (!navigator.onLine) this.connection.set('offline');
    if (!snap.exists()) {
      // Not online yet: a queue just started on this device (or held by the earlier
      // version) is saved there now.
      if (fromServer && this.confirmed()) this.flush(true);
      // Nothing here without a password: maybe the queue has one after all (its door was
      // saved just after this device looked).
      else if (fromServer && !this.password) this.recheckDoor(this.queueId);
      return;
    }
    const data = snap.get('data');
    if (typeof data !== 'string') return;
    const state = await crypto.decrypt<QueueState>(data);
    if (!state || crypto !== this.crypto) return;
    const next = normalizeState(state);
    const mine = this.confirmed();
    if (mine) this.archiveDropped(mine, next);
    this.confirmed.set(next);
    this.saveCopy(next);
    if (!snap.metadata.hasPendingWrites) this.lastWriter = snap.get('by') === this.deviceId;
  }

  /**
   * Saves this device's changes online, one transaction each and in order. Without internet
   * it tries again later; `upload` also saves a queue that isn't online yet.
   */
  private async flush(upload = false): Promise<void> {
    if (this.flushing || !this.db || !this.crypto) return;
    if (!upload && !this.pending().length) return;
    this.flushing = true;
    clearTimeout(this.retryTimer);
    const crypto = this.crypto;
    try {
      if (upload) {
        // The door first: once the queue is online, staff joining are asked for the password.
        if (this.password) await this.saveDoor(this.queueId, this.password);
        await this.commit(null);
      }
      while (crypto === this.crypto && this.pending().length) {
        const action = this.pending()[0];
        await this.commit(action);
        if (crypto !== this.crypto) break;
        this.pending.update((p) => p.filter((a) => a !== action));
        this.savePending();
      }
    } catch (e) {
      if (crypto === this.crypto) {
        // Changes the rules refuse would block everything after them; drop those.
        const code = (e as FirestoreError)?.code;
        if (code === 'permission-denied' || code === 'invalid-argument') {
          this.pending.update((p) => p.slice(1));
          this.savePending();
        }
        this.retryTimer = setTimeout(() => this.flush(), RETRY_MS);
      }
    } finally {
      this.flushing = false;
    }
    // More may have come in while the last one was being saved.
    if (crypto === this.crypto && this.pending().length && !this.retryTimer) this.flush();
  }

  /** Applies one change to the queue online (or, with none, saves the queue if it's new). */
  private async commit(action: QueueAction | null): Promise<void> {
    const crypto = this.crypto!;
    const ref = this.queueRef();
    this.retryTimer = undefined;
    // Set inside the transaction, which may run more than once.
    let before = null as QueueState | null;
    let after = null as QueueState | null;
    let refused = false as boolean;
    await runTransaction(this.db!, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.get('data') : null;
      const online = typeof data === 'string' ? await crypto.decrypt<QueueState>(data) : null;
      if (snap.exists() && !online) throw new Error('Unreadable queue');
      // Not online yet: start from this device's copy.
      const base = online ? normalizeState(online) : this.confirmed();
      before = online ? base : null;
      after = null;
      refused = false;
      if (!base) throw new Error('Queue not found');
      const result = action ? settle(base, action) : { next: base, refused: false };
      refused = result.refused;
      if (online && result.next === base) return;
      after = result.next;
      tx.set(ref, { data: await crypto.encrypt(after), by: this.deviceId, at: serverTimestamp() });
    });
    if (crypto !== this.crypto) return;
    if (refused && action?.type === 'add') this.refused.update((s) => new Set(s).add(action.id));
    if (!after) return;
    const saved = after;
    const mine = this.confirmed();
    if (mine) this.archiveDropped(mine, saved);
    this.confirmed.set(saved);
    this.saveCopy(saved);
    this.lastWriter = true;
    this.saveTracks(trackChanges(before, saved));
  }

  /** Saves what customers following their order see, for the orders that changed. */
  private saveTracks(changes: Map<string, OrderTrack | null>): void {
    const db = this.db;
    if (!db || !changes.size) return;
    const updates = [...changes].filter(([id, track]) => {
      const json = JSON.stringify(track);
      if (this.tracked.get(id) === json) return false;
      if (track) this.tracked.set(id, json);
      else this.tracked.delete(id);
      return true;
    });
    if (!updates.length) return;
    Promise.all(
      updates.map(async ([id, track]) => {
        if (!this.trackKeys.has(id)) this.trackKeys.set(id, trackCrypto(id));
        const crypto = await this.trackKeys.get(id)!;
        if (!track) this.trackKeys.delete(id);
        return { ref: doc(db, 'tracks', docId(crypto)), data: track && (await crypto.encrypt(track)) };
      }),
    ).then((writes) => {
      for (let i = 0; i < writes.length; i += 400) {
        const batch = writeBatch(db);
        for (const w of writes.slice(i, i + 400)) {
          if (w.data) batch.set(w.ref, { data: w.data, at: serverTimestamp() });
          else batch.delete(w.ref);
        }
        // Not saved: forget what was sent, so the next change sends it all again.
        batch.commit().catch(() => this.tracked.clear());
      }
    });
  }

  /**
   * Ready times move as time passes, not only when something changes. The device that made
   * the last change keeps them fresh for customers, so devices don't all write the same.
   */
  private refreshTracking(): void {
    const state = this.confirmed();
    if (!state || !this.lastWriter || this.connection() !== 'online') return;
    const changes = trackChanges(null, state);
    for (const [id, track] of changes) {
      if (this.tracked.get(id) === JSON.stringify(track)) changes.delete(id);
    }
    this.saveTracks(changes);
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

  private saveCopy(state: QueueState): void {
    try {
      localStorage.setItem(COPY_KEY(state.id), JSON.stringify(state));
      localStorage.removeItem(OLD_HOST_KEY(state.id));
    } catch {
      // Storage full or blocked; the copy is only a fallback.
    }
  }

  private loadCopy(id: string): QueueState | null {
    for (const key of [COPY_KEY(id), OLD_HOST_KEY(id)]) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return normalizeState(JSON.parse(raw) as QueueState);
      } catch {
        // Try the next one.
      }
    }
    return null;
  }

  private savePending(): void {
    if (!this.queueId) return;
    try {
      const pending = this.pending();
      const key = PENDING_KEY(this.queueId, this.deviceId);
      if (pending.length) localStorage.setItem(key, JSON.stringify(pending));
      else localStorage.removeItem(key);
    } catch {
      // They're still sent while this page stays open.
    }
  }

  /** Takes over the unsaved changes of this browser's tabs that are gone. */
  private async adoptPending(id: string): Promise<QueueAction[]> {
    let open: Set<string> | null = null;
    try {
      const locks = await navigator.locks?.query();
      if (locks) open = new Set((locks.held ?? []).map((l) => l.name ?? ''));
    } catch {
      // Without locks every other tab counts as gone; sending a change twice is harmless.
    }
    const adopted: QueueAction[] = [];
    for (const key of pendingKeys(id)) {
      const tab = key.slice(key.lastIndexOf(':') + 1);
      if (tab === this.deviceId || open?.has(TAB_LOCK(tab))) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
        if (Array.isArray(saved)) adopted.push(...saved);
        localStorage.removeItem(key);
      } catch {
        // Not readable; leave it.
      }
    }
    return adopted;
  }
}

function pendingKeys(id: string): string[] {
  const prefix = `pizza-queue:pending:${id}:`;
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}

function savedPassword(id: string): string {
  try {
    return localStorage.getItem(PASSWORD_KEY(id)) ?? '';
  } catch {
    return '';
  }
}

/** The Firestore document id for a queue or tracked order: a hash, not the id itself. */
function docId(crypto: QueueCrypto): string {
  return crypto.topic.slice(crypto.topic.lastIndexOf('/') + 1);
}

/** This app's address, keeping test overrides (emulator, follow app) so links work in local tests too. */
function appBase(): string {
  const { origin, pathname } = window.location;
  const params = new URLSearchParams();
  if (EMULATOR_HOST) params.set('emulator', EMULATOR_HOST);
  if (FOLLOW_OVERRIDE) params.set('follow', FOLLOW_OVERRIDE);
  const search = params.size ? `?${params}` : '';
  return `${origin}${pathname}${search}`;
}
