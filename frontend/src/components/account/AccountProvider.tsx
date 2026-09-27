"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { PostgrestError, User } from "@supabase/supabase-js";

import { AuthModal } from "./AuthModal";
import {
  DEFAULT_UNIVERSITY,
  blobToDataUrl,
  displayNameFor,
  handleFor,
  normalizeUsername,
  normalizeWebsite,
  resizeAvatar,
} from "@/lib/account";
import { localAccountStore } from "@/lib/local-account";
import { AVATAR_BUCKET, getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { AccountUser, Profile, ProfileInput } from "@/types/profile";

export type AccountStatus = "loading" | "signedOut" | "signedIn";
export type AuthView = "signIn" | "signUp";
/** A new photo to upload, a request to clear the photo, or leave it as is. */
export type AvatarChange = { file: File } | { remove: true } | null;

interface AccountContextValue {
  status: AccountStatus;
  /** "local" when Supabase env vars are missing and accounts live in this browser only. */
  mode: "supabase" | "local";
  user: AccountUser | null;
  profile: Profile | null;
  /** False while the signed-in user's profile row is still loading. */
  profileReady: boolean;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  university: string;
  authView: AuthView | null;
  openAuth: (view?: AuthView) => void;
  closeAuth: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string; notice?: string }>;
  signOut: () => Promise<void>;
  saveProfile: (input: ProfileInput, avatar: AvatarChange) => Promise<string | null>;
  /** One-off confirmation shown on the next screen, e.g. after saving. */
  flash: string | null;
  setFlash: (message: string | null) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

const PROFILE_FIELDS: (keyof Omit<Profile, "id">)[] = [
  "display_name",
  "username",
  "bio",
  "website",
  "university",
  "avatar_url",
];

function toAccountUser(user: User): AccountUser {
  const meta = user.user_metadata ?? {};
  const name = meta.display_name ?? meta.full_name ?? meta.name;
  return { id: user.id, email: user.email ?? null, metadataDisplayName: typeof name === "string" ? name : null };
}

/** Columns the table doesn't have yet simply come back as null. */
function toProfile(id: string, row: Record<string, unknown> | null): Profile {
  const profile = { id } as Profile;
  for (const field of PROFILE_FIELDS) {
    const value = row?.[field];
    profile[field] = typeof value === "string" && value ? value : null;
  }
  return profile;
}

function describeDbError(error: PostgrestError | { message: string; code?: string }): string {
  const message = error.message ?? "";
  if (error.code === "23505" || /duplicate key/i.test(message)) return "That username is already taken.";
  const missing = message.match(/'([a-z_]+)' column/i)?.[1];
  if (missing || error.code === "PGRST204")
    return `Your profiles table is missing the "${missing ?? "required"}" column. Run the migration in supabase/migrations first.`;
  if (error.code === "42501" || /row-level security/i.test(message))
    return "You don't have permission to update this profile. Check the profiles RLS policies.";
  return message || "Something went wrong while saving. Please try again.";
}

function describeAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(message)) return "Confirm your email address first — check your inbox.";
  if (/already registered/i.test(message)) return "An account with this email already exists. Sign in instead.";
  return message;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const mode = isSupabaseConfigured ? "supabase" : "local";

  const local = useSyncExternalStore(
    localAccountStore.subscribe,
    localAccountStore.getSnapshot,
    () => undefined,
  );

  const [remoteUser, setRemoteUser] = useState<AccountUser | null | undefined>(undefined);
  const [remoteProfile, setRemoteProfile] = useState<Profile | null>(null);
  const [authView, setAuthView] = useState<AuthView | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setRemoteUser(data.session ? toAccountUser(data.session.user) : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setRemoteUser(session ? toAccountUser(session.user) : null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const remoteUserId = remoteUser?.id ?? null;
  useEffect(() => {
    if (!supabase || !remoteUserId) return;
    let active = true;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", remoteUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn("Could not load profile:", error.message);
        setRemoteProfile(toProfile(remoteUserId, data));
      });
    return () => {
      active = false;
    };
  }, [supabase, remoteUserId]);

  const user = mode === "local" ? (local?.user ?? null) : (remoteUser ?? null);
  const profile =
    mode === "local" ? (local?.profile ?? null) : remoteProfile?.id === remoteUserId ? remoteProfile : null;
  const settled = mode === "local" ? local !== undefined : remoteUser !== undefined;
  const status: AccountStatus = !settled ? "loading" : user ? "signedIn" : "signedOut";

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        localAccountStore.signIn(email);
        return null;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? describeAuthError(error.message) : null;
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) {
        localAccountStore.signIn(email, displayName);
        return {};
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.trim() || undefined } },
      });
      if (error) return { error: describeAuthError(error.message) };
      if (!data.session) return { notice: "Check your email to confirm your account, then sign in." };
      return {};
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      localAccountStore.signOut();
      return;
    }
    await supabase.auth.signOut();
    setRemoteProfile(null);
  }, [supabase]);

  const saveProfile = useCallback(
    async (input: ProfileInput, avatar: AvatarChange): Promise<string | null> => {
      if (!user) return "You need to be signed in to edit your profile.";
      const website = normalizeWebsite(input.website);
      const fields = {
        display_name: input.display_name.trim(),
        username: normalizeUsername(input.username),
        bio: input.bio.trim() || null,
        website: website || null,
        university: input.university.trim() || DEFAULT_UNIVERSITY,
      };

      let avatarUrl = profile?.avatar_url ?? null;
      if (avatar && "remove" in avatar) avatarUrl = null;

      if (!supabase) {
        if (avatar && "file" in avatar) {
          try {
            avatarUrl = await blobToDataUrl(await resizeAvatar(avatar.file, 192));
          } catch {
            return "That image couldn't be read. Try a JPG or PNG.";
          }
        }
        localAccountStore.saveProfile({ id: user.id, ...fields, avatar_url: avatarUrl });
        return null;
      }

      if (avatar && "file" in avatar) {
        let blob: Blob;
        try {
          blob = await resizeAvatar(avatar.file);
        } catch {
          return "That image couldn't be read. Try a JPG or PNG.";
        }
        const path = `${user.id}/avatar-${Date.now()}.jpg`;
        const upload = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (upload.error)
          return `Your photo couldn't be uploaded (${upload.error.message}). Supabase Storage needs a public "${AVATAR_BUCKET}" bucket — cancel the photo change to save your other details.`;
        avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      }

      const payload = { ...fields, avatar_url: avatarUrl };
      const updated = await supabase.from("profiles").update(payload).eq("id", user.id).select("*");
      if (updated.error) return describeDbError(updated.error);

      let row = updated.data?.[0] ?? null;
      if (!row) {
        // No profile row yet (no signup trigger) — create the one row for this user.
        const inserted = await supabase
          .from("profiles")
          .insert({ id: user.id, ...payload })
          .select("*")
          .single();
        if (inserted.error) return describeDbError(inserted.error);
        row = inserted.data;
      }
      setRemoteProfile(toProfile(user.id, row));
      return null;
    },
    [supabase, user, profile],
  );

  const value = useMemo<AccountContextValue>(() => {
    const displayName = displayNameFor(user, profile);
    return {
      status,
      mode,
      user,
      profile,
      profileReady: status === "signedIn" && (mode === "local" || profile !== null),
      displayName,
      handle: handleFor(user, profile),
      avatarUrl: profile?.avatar_url ?? null,
      university: profile?.university || DEFAULT_UNIVERSITY,
      authView,
      openAuth: (view = "signIn") => setAuthView(view),
      closeAuth: () => setAuthView(null),
      signIn,
      signUp,
      signOut,
      saveProfile,
      flash,
      setFlash,
    };
  }, [status, mode, user, profile, authView, signIn, signUp, signOut, saveProfile, flash]);

  return (
    <AccountContext.Provider value={value}>
      {children}
      <AuthModal />
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount must be used inside <AccountProvider>");
  return context;
}
