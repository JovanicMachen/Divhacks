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

import {
  DEFAULT_UNIVERSITY,
  blobToDataUrl,
  displayNameFor,
  handleFor,
  normalizeUsername,
  normalizeWebsite,
  resizeAvatar,
} from "@/lib/account";
import { clearPasswordRecoveryFlag, markPasswordRecovery } from "@/lib/auth-callback";
import {
  ACCOUNT_EXISTS,
  BAD_CREDENTIALS,
  describeAuthError,
  describePasswordUpdateError,
  describeResetRequestError,
  isAuthRateLimit,
  type AuthFailure,
} from "@/lib/auth-errors";
import { passwordResetRedirectUrl } from "@/lib/password-reset";
import { localAccountStore } from "@/lib/local-account";
import { AVATAR_BUCKET, getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { AccountUser, Profile, ProfileInput } from "@/types/profile";

export type AccountStatus = "loading" | "signedOut" | "signedIn";
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
  /** Resolves with a user-facing error, or null on success. */
  signIn: (email: string, password: string) => Promise<AuthFailure | null>;
  /** `needsConfirmation` means Supabase created the user but no session yet. */
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthFailure | null>;
  updatePassword: (password: string) => Promise<AuthFailure | null>;
  saveProfile: (input: ProfileInput, avatar: AvatarChange) => Promise<string | null>;
  /** True after this tab follows a valid Supabase recovery link. */
  passwordRecovery: boolean;
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

const NETWORK_ERROR = "Couldn't reach Campus Connect's servers. Check your connection and try again.";
const isNetworkError = (message: string) => /failed to fetch|network|load failed/i.test(message);

function describeDbError(error: PostgrestError | { message: string; code?: string }): string {
  const message = error.message ?? "";
  if (isNetworkError(message)) return NETWORK_ERROR;
  if (error.code === "23505" || /duplicate key/i.test(message)) return "That username is already taken.";
  const missing = message.match(/'([a-z_]+)' column/i)?.[1];
  if (missing || error.code === "PGRST204")
    return `Your profiles table is missing the "${missing ?? "required"}" column. Run backend/supabase/migrations in the Supabase SQL editor first.`;
  if (error.code === "42501" || /row-level security/i.test(message))
    return "You don't have permission to update this profile. Check the profiles RLS policies.";
  return message || "Something went wrong while saving. Please try again.";
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
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setRemoteUser(data.session ? toAccountUser(data.session.user) : null);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setRemoteUser(session ? toAccountUser(session.user) : null);
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecovery();
        setPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        clearPasswordRecoveryFlag();
        setPasswordRecovery(false);
      }
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
        if (!localAccountStore.signIn(email)) return { message: BAD_CREDENTIALS };
        clearPasswordRecoveryFlag();
        setPasswordRecovery(false);
        return null;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (isAuthRateLimit(error)) return { message: "Sign-in didn't go through. Try again." };
        const failure = describeAuthError(error);
        return { message: failure.message };
      }
      clearPasswordRecoveryFlag();
      setPasswordRecovery(false);
      setRemoteUser(toAccountUser(data.user));
      return null;
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) return localAccountStore.signUp(email, displayName) ? {} : { error: ACCOUNT_EXISTS };
      // The profiles row comes from the database's auth.users trigger, which
      // reads display_name from the user metadata.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) return { error: describeAuthError(error).message };
      // With confirmation on, an existing email returns a user with no identities.
      if (data.user && data.user.identities?.length === 0) return { error: ACCOUNT_EXISTS };
      if (!data.session) return { needsConfirmation: true };
      setRemoteUser(toAccountUser(data.session.user));
      return {};
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      clearPasswordRecoveryFlag();
      setPasswordRecovery(false);
      localAccountStore.signOut();
      return;
    }
    clearPasswordRecoveryFlag();
    setPasswordRecovery(false);
    await supabase.auth.signOut();
    setRemoteUser(null);
    setRemoteProfile(null);
  }, [supabase]);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!supabase) return { message: "Password reset needs Supabase to be configured." };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectUrl(),
      });
      return error ? describeResetRequestError(error) : null;
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase) return { message: "Password reset needs Supabase to be configured." };
      const { error } = await supabase.auth.updateUser({ password });
      return error ? describePasswordUpdateError(error) : null;
    },
    [supabase],
  );

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
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      saveProfile,
      passwordRecovery,
      flash,
      setFlash,
    };
  }, [status, mode, user, profile, signIn, signUp, signOut, requestPasswordReset, updatePassword, saveProfile, passwordRecovery, flash]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount must be used inside <AccountProvider>");
  return context;
}
