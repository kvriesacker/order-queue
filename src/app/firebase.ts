import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebase-config';

let ready: Promise<Firestore> | null = null;

/**
 * The Firestore database, once this device is signed in (anonymously: the rules only let
 * signed-in apps in). Rejects when no Firebase project is set up.
 */
export function firestore(): Promise<Firestore> {
  ready ??= connect();
  return ready;
}

async function connect(): Promise<Firestore> {
  const emulator = EMULATOR_HOST;
  if (!emulator && !FIREBASE_CONFIG.projectId) throw new Error('No Firebase project configured');
  const app = initializeApp(
    emulator ? { projectId: 'demo-pizza-queue', apiKey: 'demo-key', authDomain: emulator } : FIREBASE_CONFIG,
  );
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator, 8085);
  }
  await auth.authStateReady();
  // Without internet the sign-in fails; keep trying until it's back.
  while (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return db;
}

/**
 * `?emulator=127.0.0.1` in the page URL uses a local Firebase emulator instead (for tests).
 * Remembered per tab, because the router drops the query string.
 */
export const EMULATOR_HOST = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('emulator');
    if (fromUrl) sessionStorage.setItem('pizza-queue:emulator', fromUrl);
    return fromUrl ?? sessionStorage.getItem('pizza-queue:emulator');
  } catch {
    return null;
  }
})();
