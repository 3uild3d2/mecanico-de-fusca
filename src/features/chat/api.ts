import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";

import { getFirebaseAuth, getFirebaseDb } from "@/shared/lib/firebase";
import {
  NEW_THREAD_TITLE,
  nextThreadTitle,
  normalizeManualTitle,
  sanitizeThread,
  type Thread,
} from "./model";

// Acesso a dados das conversas. A lógica pura (títulos, saneamento) vive em
// model.ts e é testada lá; aqui só tem I/O e o estado que o React observa.
//
// NOTA DE MIGRAÇÃO: este store manual com useSyncExternalStore será substituído
// por TanStack Query na migração ao Supabase (Fase 2 em docs/ARCHITECTURE.md).

export type { Thread } from "./model";

const LOCAL_STORAGE_KEY = "mecanico-fusca-threads-v1";
const PERSIST_DEBOUNCE_MS = 600;

let threads: Thread[] = [];
let ready = false;
let error: Error | null = null;
let userId: string | null = null;
let initPromise: Promise<void> | null = null;
let unsubscribeThreads: (() => void) | null = null;

const listeners = new Set<() => void>();
// window.setTimeout devolve number no navegador — este store só roda no cliente.
const pendingWrites = new Map<string, number>();

function isBrowser() {
  return typeof window !== "undefined";
}

function emit() {
  for (const listener of listeners) listener();
}

function setError(nextError: unknown) {
  error = nextError instanceof Error ? nextError : new Error("Erro ao sincronizar conversas.");
  emit();
}

function genId() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeThread(id: string, data: DocumentData): Thread {
  return {
    id,
    title: typeof data.title === "string" ? data.title : NEW_THREAD_TITLE,
    titleEdited: data.titleEdited === true,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    messages: Array.isArray(data.messages) ? (data.messages as UIMessage[]) : [],
  };
}

function threadsCollection(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "threads");
}

function threadDoc(uid: string, threadId: string) {
  return doc(getFirebaseDb(), "users", uid, "threads", threadId);
}

async function waitForExistingAuthUser() {
  const auth = getFirebaseAuth();
  return new Promise<User | null>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      reject,
    );
  });
}

async function ensureUser() {
  const auth = getFirebaseAuth();
  const existing = auth.currentUser ?? (await waitForExistingAuthUser());
  const user = existing ?? (await signInAnonymously(auth)).user;

  // Só perfil aqui. Entitlements (isAdmin, plano, assinatura) NUNCA são escritos
  // pelo cliente — quem escreve é o servidor. Ver docs/ARCHITECTURE.md §3.2.
  await setDoc(
    doc(getFirebaseDb(), "users", user.uid),
    {
      authMode: user.isAnonymous ? "anonymous" : "authenticated",
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return user;
}

function readLocalThreads(): Thread[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Thread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function migrateLocalThreads(uid: string) {
  if (!isBrowser()) return;

  const migrationKey = `${LOCAL_STORAGE_KEY}-firestore-migrated-${uid}`;
  if (window.localStorage.getItem(migrationKey)) return;

  const localThreads = readLocalThreads();
  if (localThreads.length === 0) {
    window.localStorage.setItem(migrationKey, "1");
    return;
  }

  const existing = await getDocs(query(threadsCollection(uid), limit(1)));
  if (existing.empty) {
    const batch = writeBatch(getFirebaseDb());
    for (const thread of localThreads) {
      batch.set(threadDoc(uid, thread.id), sanitizeThread(thread), { merge: true });
    }
    await batch.commit();
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  window.localStorage.setItem(migrationKey, "1");
}

function subscribeToFirestore(uid: string) {
  unsubscribeThreads?.();

  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    unsubscribeThreads = onSnapshot(
      query(threadsCollection(uid), orderBy("updatedAt", "desc")),
      (snapshot) => {
        threads = snapshot.docs.map((thread) => normalizeThread(thread.id, thread.data()));
        ready = true;
        error = null;
        emit();
        if (!resolved) {
          resolved = true;
          resolve();
        }
      },
      (snapshotError) => {
        setError(snapshotError);
        if (!resolved) {
          resolved = true;
          reject(snapshotError);
        }
      },
    );
  });
}

async function initializeThreads() {
  if (!isBrowser()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const user = await ensureUser();
    userId = user.uid;
    await migrateLocalThreads(user.uid);
    await subscribeToFirestore(user.uid);
  })().catch((nextError) => {
    setError(nextError);
    throw nextError;
  });

  return initPromise;
}

async function requireThreadsReady() {
  await initializeThreads();
  if (!userId) throw new Error("Usuário Firebase não inicializado.");
  return userId;
}

function upsertLocalThread(thread: Thread) {
  threads = [thread, ...threads.filter((t) => t.id !== thread.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  emit();
}

function schedulePersistThread(uid: string, thread: Thread) {
  const existing = pendingWrites.get(thread.id);
  if (existing) window.clearTimeout(existing);

  pendingWrites.set(
    thread.id,
    window.setTimeout(() => {
      pendingWrites.delete(thread.id);
      setDoc(threadDoc(uid, thread.id), sanitizeThread(thread), { merge: true }).catch(setError);
    }, PERSIST_DEBOUNCE_MS),
  );
}

function clearPendingWrites() {
  for (const timeout of pendingWrites.values()) {
    window.clearTimeout(timeout);
  }
  pendingWrites.clear();
}

export function getThreads(): Thread[] {
  void initializeThreads();
  return threads;
}

export function getThread(id: string): Thread | undefined {
  void initializeThreads();
  return threads.find((t) => t.id === id);
}

export function getThreadsError(): Error | null {
  void initializeThreads();
  return error;
}

export function areThreadsReady(): boolean {
  void initializeThreads();
  return ready;
}

export function getCurrentThreadUserId(): string | null {
  void initializeThreads();
  return userId;
}

export async function waitForThreadsReady() {
  await requireThreadsReady();
}

export async function reloadThreadsForCurrentUser() {
  if (!isBrowser()) return;

  clearPendingWrites();
  unsubscribeThreads?.();
  unsubscribeThreads = null;
  initPromise = null;
  userId = null;
  threads = [];
  ready = false;
  error = null;
  emit();

  await initializeThreads();
}

export async function createThread(): Promise<Thread> {
  const uid = await requireThreadsReady();
  const thread: Thread = {
    id: genId(),
    title: NEW_THREAD_TITLE,
    titleEdited: false,
    updatedAt: Date.now(),
    messages: [],
  };
  upsertLocalThread(thread);
  await setDoc(threadDoc(uid, thread.id), sanitizeThread(thread), { merge: true });
  return thread;
}

export async function ensureThread(id: string): Promise<Thread> {
  const uid = await requireThreadsReady();
  const existing = threads.find((t) => t.id === id);
  if (existing) return existing;

  const thread: Thread = {
    id,
    title: NEW_THREAD_TITLE,
    titleEdited: false,
    updatedAt: Date.now(),
    messages: [],
  };
  upsertLocalThread(thread);
  await setDoc(threadDoc(uid, thread.id), sanitizeThread(thread), { merge: true });
  return thread;
}

export async function deleteThread(id: string) {
  const uid = await requireThreadsReady();
  const existing = threads;
  threads = threads.filter((t) => t.id !== id);
  emit();

  try {
    await deleteDoc(threadDoc(uid, id));
  } catch (nextError) {
    threads = existing;
    setError(nextError);
    throw nextError;
  }
}

export async function updateThreadTitle(id: string, title: string) {
  const uid = await requireThreadsReady();
  const idx = threads.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Conversa não encontrada.");

  const pendingWrite = pendingWrites.get(id);
  if (pendingWrite) {
    window.clearTimeout(pendingWrite);
    pendingWrites.delete(id);
  }

  const previousThreads = threads;
  const updated: Thread = {
    ...threads[idx],
    title: normalizeManualTitle(title),
    titleEdited: true,
  };

  upsertLocalThread(updated);

  try {
    await setDoc(threadDoc(uid, id), sanitizeThread(updated), { merge: true });
  } catch (nextError) {
    threads = previousThreads;
    setError(nextError);
    throw nextError;
  }
}

export function saveThreadMessages(id: string, messages: UIMessage[]) {
  if (!userId) return;

  const idx = threads.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const existing = threads[idx];
  const updated: Thread = {
    ...existing,
    messages,
    title: nextThreadTitle(existing, messages),
    updatedAt: Date.now(),
  };

  upsertLocalThread(updated);
  schedulePersistThread(userId, updated);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  void initializeThreads();
  return () => listeners.delete(cb);
}

export function useThreads(): Thread[] {
  return useSyncExternalStore(subscribe, getThreads, () => threads);
}

export function useThread(id: string): Thread | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getThread(id),
    () => threads.find((thread) => thread.id === id),
  );
}

export function useThreadsReady(): boolean {
  return useSyncExternalStore(subscribe, areThreadsReady, () => ready);
}

export function useThreadsError(): Error | null {
  return useSyncExternalStore(subscribe, getThreadsError, () => error);
}
