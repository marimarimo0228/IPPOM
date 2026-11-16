"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

// Firebase の設定値はブラウザに出てよいもの。保護はセキュリティルールで行う。
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Firebase の設定があるか。なければ1台のブラウザだけで遊ぶローカル部屋になる。 */
export const firebaseEnabled = Boolean(config.apiKey && config.databaseURL);

export const debugEnabled =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG === "1";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getApp(): FirebaseApp {
  app ??= getApps()[0] ?? initializeApp(config);
  return app;
}

/**
 * デバッグ用：URLに ?guest=1 を付けたタブは、ほかのタブと別のプレイヤーになる。
 * 1つのブラウザの複数タブで複数人プレイを試すためのもの（再読み込みすると別人になる）。
 */
function isGuestTab(): boolean {
  if (!debugEnabled || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("guest");
}

function getAuthInstance(): Auth {
  auth ??= initializeAuth(getApp(), {
    persistence: isGuestTab() ? inMemoryPersistence : browserLocalPersistence,
  });
  return auth;
}

export function getDb(): Database {
  return getDatabase(getApp());
}

/**
 * 匿名認証でサインインし、ユーザーIDを返す。登録操作は不要。
 * このIDはブラウザに保存され、再接続で同じ席に戻るためのプレイヤーIDになる。
 */
export async function ensureSignedIn(): Promise<string> {
  const a = getAuthInstance();
  await a.authStateReady();
  if (a.currentUser) return a.currentUser.uid;
  const credential = await signInAnonymously(a);
  return credential.user.uid;
}

export function watchAuth(listener: (uid: string | null) => void): () => void {
  return onAuthStateChanged(getAuthInstance(), (user) => listener(user?.uid ?? null));
}
