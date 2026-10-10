import { Injectable, computed, signal } from '@angular/core';
import { DataConnection, Peer, PeerOptions } from 'peerjs';
import { Order, PeerMessage, QueueAction, QueueState, applyAction, randomId } from './models';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

const PEER_PREFIX = 'pizza-queue-';
const HOST_KEY = (id: string) => `pizza-queue:host:${id}`;
const RETRY_MS = 3000;

/**
 * Keeps one pizza queue in sync between browsers, peer to peer over WebRTC.
 *
 * The browser that created the queue is the host: it owns the state, saves it in
 * localStorage, applies every change and broadcasts the full queue to everyone.
 * Other browsers connect to the host's peer id and send it actions.
 */
@Injectable({ providedIn: 'root' })
export class QueueService {
  readonly state = signal<QueueState | null>(null);
  readonly connection = signal<ConnectionState>('idle');
  readonly isHost = signal(false);
  readonly guestCount = signal(0);
  readonly lastError = signal('');
  /** Ticks every 15 seconds so "x min ago" labels stay fresh. */
  readonly now = signal(Date.now());

  readonly orders = computed(() => this.state()?.orders ?? []);

  private queueId = '';
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private guests = new Set<DataConnection>();
  /** Actions a guest made while not connected; sent when the connection comes back. */
  private outbox: QueueAction[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    setInterval(() => this.now.set(Date.now()), 15000);
  }

  /** Creates a new queue hosted by this browser and returns its id. */
  create(name: string): string {
    const id = randomId();
    const state: QueueState = { id, name: name.trim() || 'Pizza queue', nextNumber: 1, orders: [] };
    localStorage.setItem(HOST_KEY(id), JSON.stringify(state));
    return id;
  }

  /** Connects to a queue, as host when this browser created it, otherwise as guest. */
  open(id: string): void {
    if (id === this.queueId) return;
    this.close();
    this.queueId = id;
    const saved = this.loadHostState(id);
    if (saved) {
      this.state.set(saved);
      this.startHost();
    } else {
      this.state.set(null);
      this.startGuest();
    }
  }

  dispatch(action: QueueAction): void {
    if (this.isHost()) {
      this.applyAsHost(action);
      return;
    }
    if (this.hostConn?.open) this.send(this.hostConn, { t: 'action', action });
    else this.outbox.push(action);
    // Show status changes right away; the host's next broadcast confirms them. New
    // orders wait for the host, which hands out the order number.
    const state = this.state();
    if (state && action.type === 'status') this.state.set(applyAction(state, action));
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
    const search = SIGNAL_SERVER ? `?signal=${encodeURIComponent(SIGNAL_SERVER)}` : '';
    return `${origin}${pathname}${search}#/q/${id}`;
  }

  private close(): void {
    clearTimeout(this.retryTimer);
    this.guests.clear();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.outbox = [];
    this.isHost.set(false);
    this.guestCount.set(0);
    this.connection.set('idle');
  }

  // ---- Host ----

  private startHost(): void {
    this.isHost.set(true);
    this.connection.set('connecting');
    const peer = new Peer(PEER_PREFIX + this.queueId, peerOptions());
    this.peer = peer;

    peer.on('open', () => {
      this.connection.set('online');
      this.lastError.set('');
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.guests.add(conn);
        this.guestCount.set(this.guests.size);
        const state = this.state();
        if (state) this.send(conn, { t: 'state', state });
      });
      conn.on('data', (data) => {
        const msg = data as PeerMessage;
        if (msg?.t === 'action') this.applyAsHost(msg.action);
      });
      const drop = () => {
        this.guests.delete(conn);
        this.guestCount.set(this.guests.size);
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => {
      // Lost the signaling server; existing peer connections keep working.
      if (!peer.destroyed) this.retry(() => peer.reconnect());
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'unavailable-id') {
        // Another tab already hosts this queue (or the server hasn't released the id
        // after a reload yet). Join as a guest; the guest falls back to hosting if
        // nobody answers.
        peer.destroy();
        this.startGuest();
        return;
      }
      this.reportError(err.type);
      if (isFatal(err.type)) {
        peer.destroy();
        this.retry(() => this.startHost());
      }
    });
  }

  private applyAsHost(action: QueueAction): void {
    const state = this.state();
    if (!state) return;
    let next: QueueState;
    try {
      next = applyAction(state, action);
    } catch {
      return; // Malformed action from a peer.
    }
    if (next === state) return;
    this.state.set(next);
    localStorage.setItem(HOST_KEY(next.id), JSON.stringify(next));
    for (const conn of this.guests) this.send(conn, { t: 'state', state: next });
  }

  // ---- Guest ----

  private startGuest(): void {
    this.isHost.set(false);
    this.connection.set('connecting');
    const peer = new Peer(peerOptions());
    this.peer = peer;

    peer.on('open', () => this.connectToHost(peer));
    peer.on('disconnected', () => {
      if (!peer.destroyed) this.retry(() => peer.reconnect());
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'peer-unavailable') {
        this.connection.set('offline');
        // This browser created the queue but another tab was hosting it; take over.
        if (this.loadHostState(this.queueId)) {
          peer.destroy();
          this.retry(() => this.startHost());
          return;
        }
        this.lastError.set('The queue host is not online. Is the creator’s tab still open?');
        this.retry(() => this.connectToHost(peer));
        return;
      }
      this.reportError(err.type);
      if (isFatal(err.type)) {
        peer.destroy();
        this.retry(() => this.startGuest());
      }
    });
  }

  private connectToHost(peer: Peer): void {
    if (peer !== this.peer || peer.destroyed) return;
    if (peer.disconnected) {
      this.retry(() => this.connectToHost(peer));
      return;
    }
    this.connection.set('connecting');
    const conn = peer.connect(PEER_PREFIX + this.queueId, { reliable: true });
    this.hostConn = conn;

    conn.on('open', () => {
      this.connection.set('online');
      this.lastError.set('');
      for (const action of this.outbox.splice(0)) this.send(conn, { t: 'action', action });
    });
    conn.on('data', (data) => {
      const msg = data as PeerMessage;
      if (msg?.t === 'state') this.state.set(msg.state);
    });
    conn.on('close', () => {
      if (conn !== this.hostConn) return;
      this.hostConn = null;
      this.connection.set('offline');
      this.retry(() => this.connectToHost(peer));
    });
  }

  // ---- Helpers ----

  private send(conn: DataConnection, msg: PeerMessage): void {
    try {
      conn.send(msg);
    } catch {
      // The connection's close handler takes care of cleanup.
    }
  }

  private retry(fn: () => void): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(fn, RETRY_MS);
  }

  private reportError(type: string): void {
    this.connection.set('offline');
    this.lastError.set(
      type === 'browser-incompatible'
        ? 'This browser does not support peer-to-peer connections.'
        : 'Connection problem, retrying…',
    );
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

function isFatal(type: string): boolean {
  return ['network', 'server-error', 'socket-error', 'socket-closed', 'ssl-unavailable'].includes(
    type,
  );
}

/**
 * Uses the free PeerJS cloud signaling server by default. `?signal=host:port` in the
 * page URL points at your own PeerJS server instead (handy for local testing).
 */
const SIGNAL_SERVER = (() => {
  // Remembered per tab, because the router drops the query string when it navigates.
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('signal');
    if (fromUrl) sessionStorage.setItem('pizza-queue:signal', fromUrl);
    return fromUrl ?? sessionStorage.getItem('pizza-queue:signal');
  } catch {
    return null;
  }
})();

function peerOptions(): PeerOptions {
  if (!SIGNAL_SERVER) return {};
  const url = new URL(SIGNAL_SERVER.includes('://') ? SIGNAL_SERVER : `http://${SIGNAL_SERVER}`);
  return {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname || '/',
    secure: url.protocol === 'https:',
  };
}
