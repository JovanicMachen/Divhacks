import type { AccountUser, Profile } from "@/types/profile";

/**
 * Browser-only stand-in for Supabase Auth + `profiles`, used when the Supabase
 * env vars are missing so the account flow can still be exercised locally.
 * Passwords are never stored.
 */
interface LocalAccount {
  user: AccountUser;
  profile: Profile;
}

interface LocalState {
  current: string | null;
  accounts: Record<string, LocalAccount>;
}

const KEY = "campus-connect.local-account";
/**
 * Each tab remembers which local account it is signed in as, so two accounts
 * can be used side by side (e.g. to try deleting someone else's event). New
 * tabs start as the most recently signed-in account, like a shared session.
 */
const TAB_KEY = "campus-connect.local-session";
const EMPTY: LocalState = { current: null, accounts: {} };
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedState: LocalState = EMPTY;

function read(): LocalState {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedState = raw ? (JSON.parse(raw) as LocalState) : EMPTY;
    } catch {
      cachedState = EMPTY;
    }
  }
  return cachedState;
}

function tabSession(state: LocalState): string | null {
  const pinned = window.sessionStorage.getItem(TAB_KEY);
  if (pinned !== null) return pinned && state.accounts[pinned] ? pinned : null;
  if (state.current) window.sessionStorage.setItem(TAB_KEY, state.current);
  return state.current;
}

function write(next: LocalState) {
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.sessionStorage.setItem(TAB_KEY, next.current ?? "");
  listeners.forEach((listener) => listener());
}

export const localAccountStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === KEY && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): LocalAccount | null {
    const state = read();
    const current = tabSession(state);
    return current ? (state.accounts[current] ?? null) : null;
  },
  /** Returns false when no local account exists for this email. */
  signIn(email: string): boolean {
    const state = read();
    const key = email.toLowerCase();
    if (!state.accounts[key]) return false;
    write({ ...state, current: key });
    return true;
  },
  /** Returns false when the email is already registered. */
  signUp(email: string, displayName: string): boolean {
    const state = read();
    const key = email.toLowerCase();
    if (state.accounts[key]) return false;
    const account: LocalAccount = {
      user: { id: crypto.randomUUID(), email: key, metadataDisplayName: displayName.trim() || null },
      profile: {
        id: "",
        display_name: null,
        username: null,
        bio: null,
        website: null,
        university: null,
        avatar_url: null,
      },
    };
    account.profile.id = account.user.id;
    write({ current: key, accounts: { ...state.accounts, [key]: account } });
    return true;
  },
  signOut() {
    write({ ...read(), current: null });
  },
  /** Public name and photo of a local account, for chat. Never the email. */
  publicProfile(userId: string): { name: string | null; avatarUrl: string | null } | null {
    const account = Object.values(read().accounts).find((a) => a.user.id === userId);
    if (!account) return null;
    return {
      name: account.profile.display_name?.trim() || account.user.metadataDisplayName?.trim() || null,
      avatarUrl: account.profile.avatar_url ?? null,
    };
  },
  saveProfile(profile: Profile) {
    const state = read();
    const current = tabSession(state);
    if (!current) throw new Error("Not signed in");
    const account = state.accounts[current];
    write({ ...state, current, accounts: { ...state.accounts, [current]: { ...account, profile } } });
  },
};
