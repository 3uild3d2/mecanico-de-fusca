import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { z } from "zod";

import { garantirSessao } from "@/features/auth/supabase-auth";
import type { PapelMensagem } from "@/shared/lib/database.types";
import { getQueryClient } from "@/shared/lib/query-client";
import { getSupabase } from "@/shared/lib/supabase";
import {
  NEW_THREAD_TITLE,
  nextThreadTitle,
  normalizeManualTitle,
  sanitizeMessages,
  type Thread,
} from "./model";

export type { Thread } from "./model";

const THREADS_QUERY_KEY = ["threads"] as const;
const PERSIST_DEBOUNCE_MS = 600;

let currentUserId: string | null = null;
const pendingWrites = new Map<string, number>();

const messagePartsSchema = z.array(z.unknown());

function isBrowser() {
  return typeof window !== "undefined";
}

function genId() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeRole(role: string): PapelMensagem {
  return role === "system" || role === "assistant" ? role : "user";
}

function normalizeMessage(row: { id: string; papel: string; partes: unknown }): UIMessage {
  const parsedParts = messagePartsSchema.safeParse(row.partes);

  return {
    id: row.id,
    role: normalizeRole(row.papel),
    parts: parsedParts.success ? (parsedParts.data as UIMessage["parts"]) : [],
  };
}

async function requireUserId() {
  const user = await garantirSessao();
  currentUserId = user.id;
  return user.id;
}

function getCachedThreads() {
  return getQueryClient().getQueryData<Thread[]>(THREADS_QUERY_KEY) ?? [];
}

function setCachedThreads(nextThreads: Thread[]) {
  getQueryClient().setQueryData(
    THREADS_QUERY_KEY,
    [...nextThreads].sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

function upsertCachedThread(thread: Thread) {
  const current = getCachedThreads();
  setCachedThreads([thread, ...current.filter((item) => item.id !== thread.id)]);
}

async function fetchThreads(): Promise<Thread[]> {
  const uid = await requireUserId();
  const supabase = getSupabase();

  const { data: threadRows, error: threadError } = await supabase
    .from("threads")
    .select("id,titulo,titulo_editado,atualizado_em")
    .eq("user_id", uid)
    .order("atualizado_em", { ascending: false });

  if (threadError) throw threadError;
  if (!threadRows || threadRows.length === 0) return [];

  const threadIds = threadRows.map((thread) => thread.id);
  const { data: messageRows, error: messageError } = await supabase
    .from("messages")
    .select("id,thread_id,papel,partes,criado_em")
    .in("thread_id", threadIds)
    .order("criado_em", { ascending: true });

  if (messageError) throw messageError;

  const messagesByThread = new Map<string, UIMessage[]>();
  for (const row of messageRows ?? []) {
    const current = messagesByThread.get(row.thread_id) ?? [];
    current.push(normalizeMessage(row));
    messagesByThread.set(row.thread_id, current);
  }

  return threadRows.map((row) => ({
    id: row.id,
    title: row.titulo || NEW_THREAD_TITLE,
    titleEdited: row.titulo_editado === true,
    updatedAt: toTimestamp(row.atualizado_em),
    messages: messagesByThread.get(row.id) ?? [],
  }));
}

async function persistThreadMessages(uid: string, thread: Thread) {
  const supabase = getSupabase();
  const sanitized = sanitizeMessages(thread.messages);

  const { error: threadError } = await supabase
    .from("threads")
    .update({ titulo: thread.title, titulo_editado: thread.titleEdited === true })
    .eq("id", thread.id)
    .eq("user_id", uid);

  if (threadError) throw threadError;

  if (sanitized.length === 0) return;

  const rows = sanitized.map((message) => ({
    id: message.id,
    thread_id: thread.id,
    user_id: uid,
    papel: normalizeRole(message.role),
    partes: message.parts,
  }));

  const { error: messageError } = await supabase.from("messages").upsert(rows, {
    onConflict: "id",
  });

  if (messageError) throw messageError;
}

function schedulePersistThread(uid: string, thread: Thread) {
  if (!isBrowser()) return;

  const existing = pendingWrites.get(thread.id);
  if (existing) window.clearTimeout(existing);

  pendingWrites.set(
    thread.id,
    window.setTimeout(() => {
      pendingWrites.delete(thread.id);
      persistThreadMessages(uid, thread).catch((error) => {
        console.error("Erro ao salvar conversa:", error);
      });
    }, PERSIST_DEBOUNCE_MS),
  );
}

function clearPendingWrites() {
  if (!isBrowser()) return;
  for (const timeout of pendingWrites.values()) window.clearTimeout(timeout);
  pendingWrites.clear();
}

export function getThreads(): Thread[] {
  return getCachedThreads();
}

export function getThread(id: string): Thread | undefined {
  return getCachedThreads().find((thread) => thread.id === id);
}

export function getThreadsError(): Error | null {
  const query = getQueryClient().getQueryCache().find({ queryKey: THREADS_QUERY_KEY });
  const error = query?.state.error;
  return error instanceof Error ? error : null;
}

export function areThreadsReady(): boolean {
  const query = getQueryClient().getQueryCache().find({ queryKey: THREADS_QUERY_KEY });
  return query?.state.status === "success";
}

export function getCurrentThreadUserId(): string | null {
  return currentUserId;
}

export async function waitForThreadsReady() {
  await getQueryClient().ensureQueryData({ queryKey: THREADS_QUERY_KEY, queryFn: fetchThreads });
}

export async function reloadThreadsForCurrentUser() {
  clearPendingWrites();
  currentUserId = null;
  getQueryClient().removeQueries({ queryKey: THREADS_QUERY_KEY });
  await waitForThreadsReady();
}

export async function createThread(): Promise<Thread> {
  const uid = await requireUserId();
  const now = Date.now();
  const thread: Thread = {
    id: genId(),
    title: NEW_THREAD_TITLE,
    titleEdited: false,
    updatedAt: now,
    messages: [],
  };

  upsertCachedThread(thread);

  const { error } = await getSupabase().from("threads").insert({
    id: thread.id,
    user_id: uid,
    titulo: thread.title,
    titulo_editado: false,
  });

  if (error) {
    setCachedThreads(getCachedThreads().filter((item) => item.id !== thread.id));
    throw error;
  }

  return thread;
}

export async function ensureThread(id: string): Promise<Thread> {
  await waitForThreadsReady();
  const existing = getThread(id);
  if (existing) return existing;

  const uid = await requireUserId();
  const thread: Thread = {
    id,
    title: NEW_THREAD_TITLE,
    titleEdited: false,
    updatedAt: Date.now(),
    messages: [],
  };

  upsertCachedThread(thread);

  const { error } = await getSupabase().from("threads").insert({
    id,
    user_id: uid,
    titulo: NEW_THREAD_TITLE,
    titulo_editado: false,
  });

  if (error) throw error;
  return thread;
}

export async function deleteThread(id: string) {
  const previousThreads = getCachedThreads();
  setCachedThreads(previousThreads.filter((thread) => thread.id !== id));

  const { error } = await getSupabase().from("threads").delete().eq("id", id);
  if (error) {
    setCachedThreads(previousThreads);
    throw error;
  }
}

export async function updateThreadTitle(id: string, title: string) {
  const thread = getThread(id);
  if (!thread) throw new Error("Conversa não encontrada.");

  const previousThreads = getCachedThreads();
  const updated: Thread = {
    ...thread,
    title: normalizeManualTitle(title),
    titleEdited: true,
    updatedAt: Date.now(),
  };

  upsertCachedThread(updated);

  const { error } = await getSupabase()
    .from("threads")
    .update({ titulo: updated.title, titulo_editado: true })
    .eq("id", id);

  if (error) {
    setCachedThreads(previousThreads);
    throw error;
  }
}

export function saveThreadMessages(id: string, messages: UIMessage[]) {
  const uid = currentUserId;
  if (!uid) return;

  const thread = getThread(id);
  if (!thread) return;

  const updated: Thread = {
    ...thread,
    messages,
    title: nextThreadTitle(thread, messages),
    updatedAt: Date.now(),
  };

  upsertCachedThread(updated);
  schedulePersistThread(uid, updated);
}

export function useThreads(): Thread[] {
  return useQuery({ queryKey: THREADS_QUERY_KEY, queryFn: fetchThreads }).data ?? [];
}

export function useThread(id: string): Thread | undefined {
  const { data } = useQuery({ queryKey: THREADS_QUERY_KEY, queryFn: fetchThreads });
  return data?.find((thread) => thread.id === id);
}

export function useThreadsReady(): boolean {
  const query = useQuery({ queryKey: THREADS_QUERY_KEY, queryFn: fetchThreads });
  return query.isSuccess;
}

export function useThreadsError(): Error | null {
  const query = useQuery({ queryKey: THREADS_QUERY_KEY, queryFn: fetchThreads });
  return query.error instanceof Error ? query.error : null;
}
