"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Camera, Info, Loader2 } from "lucide-react";

import { useAccount, type AvatarChange } from "./AccountProvider";
import { Avatar } from "./Avatar";
import {
  BIO_MAX,
  DEFAULT_UNIVERSITY,
  DISPLAY_NAME_MAX,
  USERNAME_MAX,
  normalizeUsername,
  validateProfile,
  type ProfileErrors,
} from "@/lib/account";
import { INPUT, LABEL } from "@/lib/form-styles";
import { cn } from "@/lib/utils";
import type { ProfileInput } from "@/types/profile";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function ProfileEditForm() {
  const { profileReady, user } = useAccount();
  if (!profileReady || !user)
    return (
      <div aria-busy className="grid place-items-center pt-24 text-muted">
        <Loader2 size={24} className="animate-spin" aria-label="Loading profile" />
      </div>
    );
  return <EditForm key={user.id} />;
}

function EditForm() {
  const { user, profile, displayName, saveProfile, setFlash, mode } = useAccount();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ProfileInput>(() => ({
    display_name: profile?.display_name ?? displayName,
    username:
      profile?.username ??
      normalizeUsername(user?.email?.split("@")[0] ?? "").replace(/[^a-z0-9._]/g, "").slice(0, USERNAME_MAX),
    bio: profile?.bio ?? "",
    website: profile?.website ?? "",
    university: profile?.university ?? DEFAULT_UNIVERSITY,
  }));
  const [avatar, setAvatar] = useState<AvatarChange>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors: ProfileErrors = validateProfile(values);
  const shownAvatar = avatar === null ? (profile?.avatar_url ?? null) : "file" in avatar ? preview : null;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const set = (key: keyof ProfileInput, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPhotoError("Choose an image file (JPG, PNG, or WebP).");
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError("That photo is over 8 MB. Choose a smaller one.");
    setPhotoError(null);
    setAvatar({ file });
    setPreview(URL.createObjectURL(file));
  };

  const resetPhoto = () => {
    setAvatar(null);
    setPreview(null);
    setPhotoError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    const error = await saveProfile(values, avatar);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setFlash("Profile updated.");
    router.push("/profile");
  };

  const fieldError = (key: keyof ProfileInput) =>
    showErrors && errors[key] ? (
      <p role="alert" className="mt-[6px] text-[12.5px] font-semibold text-coral-text">
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[640px] px-3 pb-12 pt-4 tablet:px-6 tablet:pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/profile"
          aria-label="Back to profile"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
        >
          <ArrowLeft size={20} strokeWidth={2.2} />
        </Link>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Edit profile</h1>
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="rounded-[22px] border border-line bg-panel shadow-[0_2px_8px_rgb(16_37_71_/_0.04)]"
      >
        <div className="flex flex-col items-center gap-4 border-b border-line px-5 py-6 tablet:flex-row tablet:px-7">
          <div className="relative">
            <Avatar src={shownAvatar} name={values.display_name.trim() || displayName} size={88} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Choose a profile photo"
              className="absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full bg-brand text-white ring-[3px] ring-panel transition-colors hover:bg-brand-dark"
            >
              <Camera size={15} strokeWidth={2.4} />
            </button>
          </div>
          <div className="text-center tablet:text-left">
            <p className="text-[15px] font-bold text-ink">Profile photo</p>
            <p className="mt-[2px] text-[13px] font-medium text-muted">
              {avatar && "file" in avatar ? "New photo selected — save to apply it." : "A square photo works best."}
            </p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2 tablet:justify-start">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-9 rounded-[10px] bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-[#dde8fa]"
              >
                {shownAvatar ? "Change photo" : "Upload photo"}
              </button>
              {avatar !== null ? (
                <button
                  type="button"
                  onClick={resetPhoto}
                  className="h-9 rounded-[10px] bg-field px-3.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
                >
                  Cancel change
                </button>
              ) : (
                profile?.avatar_url && (
                  <button
                    type="button"
                    onClick={() => setAvatar({ remove: true })}
                    className="h-9 rounded-[10px] bg-field px-3.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
                  >
                    Remove photo
                  </button>
                )
              )}
            </div>
            {photoError && (
              <p role="alert" className="mt-2 text-[12.5px] font-semibold text-coral-text">
                {photoError}
              </p>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        </div>

        <div className="space-y-[18px] px-5 py-6 tablet:px-7">
          <div>
            <label htmlFor="pf-name" className={LABEL}>
              Display Name
            </label>
            <input
              id="pf-name"
              value={values.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="name"
              aria-invalid={showErrors && Boolean(errors.display_name)}
              className={cn(INPUT, "h-11")}
            />
            {fieldError("display_name")}
          </div>

          <div>
            <label htmlFor="pf-username" className={LABEL}>
              Username
            </label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14.5px] font-semibold text-faint">
                @
              </span>
              <input
                id="pf-username"
                value={values.username}
                onChange={(e) => set("username", normalizeUsername(e.target.value))}
                maxLength={USERNAME_MAX}
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
                aria-describedby="pf-username-hint"
                aria-invalid={showErrors && Boolean(errors.username)}
                className={cn(INPUT, "h-11 pl-8")}
              />
            </div>
            {fieldError("username") ?? (
              <p id="pf-username-hint" className="mt-[6px] text-[12.5px] font-medium text-faint">
                Lowercase letters, numbers, underscores, and periods.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="pf-bio" className={LABEL}>
                Bio
              </label>
              <span
                aria-live="polite"
                className={cn(
                  "text-[12.5px] font-semibold tabular-nums",
                  values.bio.length > BIO_MAX ? "text-coral-text" : "text-faint",
                )}
              >
                {values.bio.length} / {BIO_MAX}
              </span>
            </div>
            <textarea
              id="pf-bio"
              value={values.bio}
              onChange={(e) => set("bio", e.target.value)}
              rows={3}
              placeholder="Year, major, clubs — what should people know?"
              aria-invalid={showErrors && Boolean(errors.bio)}
              className={cn(INPUT, "resize-none py-2.5 leading-[1.4]")}
            />
            {fieldError("bio")}
          </div>

          <div>
            <label htmlFor="pf-website" className={LABEL}>
              Website
            </label>
            <input
              id="pf-website"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="yourwebsite.com"
              aria-invalid={showErrors && Boolean(errors.website)}
              className={cn(INPUT, "h-11")}
            />
            {fieldError("website")}
          </div>

          <div>
            <label htmlFor="pf-university" className={LABEL}>
              University
            </label>
            <input
              id="pf-university"
              value={values.university}
              onChange={(e) => set("university", e.target.value)}
              maxLength={80}
              aria-invalid={showErrors && Boolean(errors.university)}
              className={cn(INPUT, "h-11")}
            />
            {fieldError("university")}
          </div>

          {mode === "local" && (
            <p className="flex items-start gap-[7px] rounded-[11px] bg-[#F3F6FB] px-[11px] py-[9px] text-[12.5px] font-medium leading-[1.4] text-muted">
              <Info size={14} strokeWidth={2.3} aria-hidden className="mt-[1px] shrink-0 text-faint" />
              Local preview: Supabase isn&apos;t configured here, so changes are saved in this browser only.
            </p>
          )}
          {saveError && (
            <p role="alert" className="flex items-start gap-2 rounded-[12px] bg-coral-soft px-3.5 py-3 text-[13.5px] font-semibold text-coral-text">
              <AlertCircle size={17} strokeWidth={2.4} aria-hidden className="mt-[1px] shrink-0" />
              {saveError}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-line px-5 py-4 tablet:px-7">
          <Link
            href="/profile"
            className="flex h-11 items-center rounded-[12px] bg-field px-5 text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
          >
            Cancel
          </Link>
          <motion.button
            type="submit"
            disabled={saving}
            whileHover={saving ? undefined : { y: -1 }}
            whileTap={saving ? undefined : { scale: 0.98, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex h-11 items-center gap-2 rounded-[12px] bg-brand px-6 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark active:bg-brand-press disabled:cursor-wait disabled:opacity-80"
          >
            {saving && <Loader2 size={16} strokeWidth={2.6} className="animate-spin" aria-hidden />}
            {saving ? "Saving…" : "Save Changes"}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
