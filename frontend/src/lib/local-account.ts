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

function write(next: LocalState) {
  window.localStorage.setItem(KEY, JSON.stringify(next));
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
    return state.current ? (state.accounts[state.current] ?? null) : null;
  },
  signIn(email: string, displayName?: string) {
    const state = read();
    const key = email.toLowerCase();
    const existing = state.accounts[key];
    const account: LocalAccount = existing ?? {
      user: { id: crypto.randomUUID(), email: key, metadataDisplayName: displayName?.trim() || null },
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
  },
  signOut() {
    write({ ...read(), current: null });
  },
  saveProfile(profile: Profile) {
    const state = read();
    if (!state.current) throw new Error("Not signed in");
    const account = state.accounts[state.current];
    write({ ...state, accounts: { ...state.accounts, [state.current]: { ...account, profile } } });
  },
};
