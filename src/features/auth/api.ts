import { useSyncExternalStore } from "react";
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type AuthError,
  type User,
} from "firebase/auth";

import { getFirebaseAuth } from "@/shared/lib/firebase";
import { reloadThreadsForCurrentUser } from "@/features/chat/api";

let currentUser: User | null = null;
let ready = false;
let unsubscribeAuth: (() => void) | null = null;

const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined";
}

function emit() {
  for (const listener of listeners) listener();
}

function initAuthListener() {
  if (!isBrowser() || unsubscribeAuth) return;

  unsubscribeAuth = onAuthStateChanged(getFirebaseAuth(), (user) => {
    currentUser = user;
    ready = true;
    emit();
  });
}

function isAuthError(error: unknown): error is AuthError {
  return error != null && typeof error === "object" && "code" in error;
}

export function getAuthUser() {
  initAuthListener();
  return currentUser;
}

export function isAuthReady() {
  initAuthListener();
  return ready;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    // Vincular preserva o histórico criado enquanto o usuário estava anônimo.
    if (auth.currentUser?.isAnonymous) {
      await linkWithPopup(auth.currentUser, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (error) {
    if (
      isAuthError(error) &&
      (error.code === "auth/credential-already-in-use" ||
        error.code === "auth/provider-already-linked" ||
        error.code === "auth/email-already-in-use")
    ) {
      await signInWithPopup(auth, provider);
    } else {
      throw error;
    }
  }

  await reloadThreadsForCurrentUser();
}

export async function signOutToAnonymous() {
  await signOut(getFirebaseAuth());
  await reloadThreadsForCurrentUser();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  initAuthListener();
  return () => listeners.delete(cb);
}

export function useAuthUser() {
  return useSyncExternalStore(subscribe, getAuthUser, () => currentUser);
}

export function useAuthReady() {
  return useSyncExternalStore(subscribe, isAuthReady, () => ready);
}
