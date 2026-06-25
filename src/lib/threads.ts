import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

export type Thread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const STORAGE_KEY = "mecanico-fusca-threads-v1";

let threads: Thread[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined";
}

function persist() {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // storage full or unavailable — ignore
  }
}

function hydrate() {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Thread[];
      if (Array.isArray(parsed)) {
        threads = parsed;
      }
    }
  } catch {
    threads = [];
  }
}

function emit() {
  for (const l of listeners) l();
}

function genId() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getThreads(): Thread[] {
  hydrate();
  return threads;
}

export function getThread(id: string): Thread | undefined {
  hydrate();
  return threads.find((t) => t.id === id);
}

export function createThread(): Thread {
  hydrate();
  const thread: Thread = {
    id: genId(),
    title: "Nova conversa",
    updatedAt: Date.now(),
    messages: [],
  };
  threads = [thread, ...threads];
  persist();
  emit();
  return thread;
}

export function ensureThread(id: string): Thread {
  hydrate();
  const existing = threads.find((t) => t.id === id);
  if (existing) return existing;
  const thread: Thread = {
    id,
    title: "Nova conversa",
    updatedAt: Date.now(),
    messages: [],
  };
  threads = [thread, ...threads];
  persist();
  emit();
  return thread;
}

export function deleteThread(id: string) {
  hydrate();
  threads = threads.filter((t) => t.id !== id);
  persist();
  emit();
}

function deriveTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = firstUser.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function saveThreadMessages(id: string, messages: UIMessage[]) {
  hydrate();
  const idx = threads.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const existing = threads[idx];
  const title =
    existing.title === "Nova conversa"
      ? deriveTitle(messages) ?? existing.title
      : existing.title;
  const updated: Thread = {
    ...existing,
    messages,
    title,
    updatedAt: Date.now(),
  };
  // Move the active thread to the top so the sidebar stays sorted by recency.
  threads = [updated, ...threads.filter((t) => t.id !== id)];
  persist();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useThreads(): Thread[] {
  return useSyncExternalStore(subscribe, getThreads, () => threads);
}
