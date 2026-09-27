"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ChevronDown, ImagePlus, Info, Loader2, MapPin, Plus, RefreshCw, Trash2, X } from "lucide-react";

import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { CAMPUS_LOCATIONS, getCampusLocation } from "@/data/campus-locations";
import { CATEGORY_STYLE, EVENT_CATEGORIES, MARKER_PALETTE } from "@/lib/constants";
import { PHOTO_TYPES, photoError } from "@/lib/event-photos";
import { cn, isTimeRangeValid } from "@/lib/utils";
import type { EventDraft } from "@/types/event";

interface CreateEventModalProps {
  open: boolean;
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  onClose: () => void;
  /** Hides the modal and lets the user tap a spot on the campus map. */
  onChooseOnMap: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitError?: string | null;
  /** Local preview mode: events are saved in this browser only. */
  localPreview?: boolean;
}

const LOCATION_OPTIONS = [...CAMPUS_LOCATIONS].sort((a, b) => a.name.localeCompare(b.name));

type Field = "title" | "point" | "time";

const INPUT =
  "w-full rounded-[12px] border border-line bg-field px-3.5 text-[14.5px] font-medium text-ink placeholder:font-normal placeholder:text-faint outline-none transition-[background-color,border-color,box-shadow] duration-150 focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10";
const LABEL = "mb-[7px] block text-[13px] font-bold text-ink-soft";

function validate(draft: EventDraft): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!draft.title.trim()) errors.title = "Give your event a title.";
  if (!draft.point) errors.point = "Pick a campus location or choose a spot on the map.";
  if (!isTimeRangeValid(draft.startTime, draft.endTime)) errors.time = "End time must be after the start time.";
  return errors;
}

/** Optional cover photo: pick, preview, replace, or remove before posting. */
function PhotoField({ photo, onChange }: { photo: File | null; onChange: (photo: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = photoError(file);
    setError(problem);
    if (!problem) onChange(file);
  };

  return (
    <section aria-labelledby="ev-photo-label">
      <div className="mb-[7px] flex items-baseline justify-between gap-3">
        <span id="ev-photo-label" className="text-[13px] font-bold text-ink-soft">
          Event Photo
        </span>
        <span className="text-[12px] font-semibold text-faint">Optional</span>
      </div>
      <input
        ref={inputRef}
        id="ev-photo"
        type="file"
        accept={PHOTO_TYPES.join(",")}
        onChange={pick}
        aria-label="Event photo"
        className="sr-only"
      />
      {preview ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-field">
          {/* Local object URL for the chosen file; next/image doesn't apply. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected event photo" className="h-[168px] w-full object-cover" />
          <div className="flex items-center justify-between gap-2 border-t border-line bg-panel px-3 py-2">
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-muted">{photo?.name}</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-[13px] font-bold text-brand transition-colors hover:bg-[#dde8fa]"
              >
                <RefreshCw size={14} strokeWidth={2.4} aria-hidden />
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
                className="flex h-8 items-center gap-1.5 rounded-full bg-field px-3 text-[13px] font-bold text-coral-text transition-colors hover:bg-coral-soft"
              >
                <Trash2 size={14} strokeWidth={2.4} aria-hidden />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby="ev-photo-hint"
          className="group flex w-full items-center gap-3.5 rounded-[14px] border border-dashed border-line-strong bg-field px-4 py-3.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-tint"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-panel text-brand shadow-pill">
            <ImagePlus size={22} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-ink">Show students what&apos;s happening</span>
            <span id="ev-photo-hint" className="mt-[2px] block text-[12.5px] font-medium text-muted">
              JPG, PNG or WebP · up to 5 MB
            </span>
          </span>
          <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[13.5px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.22)] transition-colors group-hover:bg-brand-dark">
            <Plus size={15} strokeWidth={2.8} aria-hidden />
            Add Photo
          </span>
        </button>
      )}
      {error && (
        <p role="alert" className="mt-[6px] text-[12.5px] font-semibold text-coral-text">
          {error}
        </p>
      )}
    </section>
  );
}

/** "Post Event" form. */
export function CreateEventModal({
  open,
  draft,
  onChange,
  onClose,
  onChooseOnMap,
  onSubmit,
  submitting = false,
  submitError = null,
  localPreview = false,
}: CreateEventModalProps) {
  const titleId = useId();
  const [showErrors, setShowErrors] = useState(false);
  const errors = validate(draft);
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange({ ...draft, [key]: value });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    onSubmit();
  };

  const error = (field: Field) =>
    showErrors && errors[field] ? (
      <p role="alert" className="mt-[6px] text-[12.5px] font-semibold text-coral-text">
        {errors[field]}
      </p>
    ) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="create-event"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-3 backdrop-blur-[2px] tablet:p-6"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={submit}
            noValidate
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="flex max-h-[92vh] w-full max-w-[540px] flex-col overflow-hidden rounded-[20px] bg-panel shadow-[0_24px_60px_rgba(15,37,71,0.22)]"
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6 tablet:px-7">
              <div>
                <h2 id={titleId} className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                  Post an event
                </h2>
                <p className="mt-[3px] text-[14px] font-medium text-muted">
                  Share what&apos;s happening on campus right now.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-field text-ink transition-colors hover:bg-[#e6eaf2]"
              >
                <X size={16} strokeWidth={2.6} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto px-6 pb-2 tablet:px-7 scrollbar-none">
              <div>
                <label htmlFor="ev-title" className={LABEL}>
                  Title
                </label>
                <input
                  id="ev-title"
                  autoFocus
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Free bagels outside Butler"
                  maxLength={80}
                  aria-invalid={showErrors && Boolean(errors.title)}
                  className={cn(INPUT, "h-11")}
                />
                {error("title")}
              </div>

              <PhotoField photo={draft.photo} onChange={(photo) => set("photo", photo)} />

              <div>
                <label htmlFor="ev-desc" className={LABEL}>
                  Description
                </label>
                <textarea
                  id="ev-desc"
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What should people know before they come?"
                  rows={3}
                  maxLength={400}
                  className={cn(INPUT, "resize-none py-2.5 leading-[1.4]")}
                />
              </div>

              <fieldset>
                <legend className={LABEL}>Category</legend>
                <div className="grid grid-cols-2 gap-2 tablet:grid-cols-3">
                  {EVENT_CATEGORIES.map((category) => {
                    const selected = draft.category === category;
                    const palette = MARKER_PALETTE[CATEGORY_STYLE[category].markerColor];
                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => set("category", category)}
                        className={cn(
                          "flex h-10 items-center gap-2 rounded-[11px] border px-3 text-[13.5px] font-semibold transition-colors duration-150",
                          selected ? "border-transparent" : "border-line bg-panel text-ink-soft hover:bg-[#f5f7fb]",
                        )}
                        style={
                          selected
                            ? { backgroundColor: palette.soft, color: palette.text, boxShadow: `inset 0 0 0 1.5px ${palette.solid}` }
                            : undefined
                        }
                      >
                        <CategoryGlyph category={category} size={16} />
                        <span className="truncate">{category}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="ev-place" className={LABEL}>
                  Location
                </label>
                <div className="flex flex-col gap-2 tablet:flex-row">
                  <div className="relative min-w-0 tablet:flex-1">
                    <select
                      id="ev-place"
                      value={draft.locationId ?? (draft.point ? "custom" : "")}
                      onChange={(e) => {
                        const place = getCampusLocation(e.target.value);
                        if (place) {
                          onChange({
                            ...draft,
                            locationId: place.id,
                            locationName: place.name,
                            point: { x: place.mapX, y: place.mapY },
                          });
                        }
                      }}
                      aria-invalid={showErrors && Boolean(errors.point)}
                      className={cn(INPUT, "h-11 cursor-pointer appearance-none pr-9", !draft.point && "text-faint")}
                    >
                      <option value="" disabled>
                        Choose a campus location
                      </option>
                      {draft.point && !draft.locationId && <option value="custom">Pinned spot on the map</option>}
                      {LOCATION_OPTIONS.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={17}
                      strokeWidth={2.3}
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onChooseOnMap}
                    className={cn(
                      "flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-bold transition-colors duration-150",
                      draft.point
                        ? "bg-[#DFF3E6] text-[#1F914A] hover:bg-[#d2eedc]"
                        : "bg-brand-soft text-brand hover:bg-[#dde8fa]",
                    )}
                  >
                    {draft.point ? <Check size={16} strokeWidth={2.8} /> : <MapPin size={16} strokeWidth={2.4} />}
                    {draft.point ? "Pinned · Change" : "Choose on map"}
                  </button>
                </div>
                {draft.point && !draft.locationId && (
                  <input
                    id="ev-location"
                    aria-label="Name this spot"
                    value={draft.locationName}
                    onChange={(e) => set("locationName", e.target.value)}
                    placeholder="Name this spot, e.g. Steps outside Avery"
                    maxLength={60}
                    className={cn(INPUT, "mt-2 h-11")}
                  />
                )}
                {error("point")}
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ev-start" className={LABEL}>
                      Starts
                    </label>
                    <input
                      id="ev-start"
                      type="time"
                      value={draft.startTime}
                      onChange={(e) => set("startTime", e.target.value)}
                      className={cn(INPUT, "h-11")}
                    />
                  </div>
                  <div>
                    <label htmlFor="ev-end" className={LABEL}>
                      Ends
                    </label>
                    <input
                      id="ev-end"
                      type="time"
                      value={draft.endTime}
                      onChange={(e) => set("endTime", e.target.value)}
                      aria-invalid={showErrors && Boolean(errors.time)}
                      className={cn(INPUT, "h-11")}
                    />
                  </div>
                </div>
                {error("time")}
              </div>
            </div>

            <div className="px-6 pb-6 pt-4 tablet:px-7">
              <p className="flex items-start gap-[7px] rounded-[11px] bg-[#F3F6FB] px-[11px] py-[9px] text-[12.5px] font-medium leading-[1.4] text-muted">
                <Info size={14} strokeWidth={2.3} aria-hidden className="mt-[1px] shrink-0 text-faint" />
                {localPreview
                  ? "Local preview: Supabase isn't connected, so posted events are saved in this browser only. You can delete your own events any time."
                  : "Your event is saved to Campus Connect and shown to everyone signed in. You can delete it any time."}
              </p>
              {submitError && (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-[7px] rounded-[11px] bg-coral-soft px-[11px] py-[9px] text-[13px] font-semibold leading-[1.4] text-coral-text"
                >
                  <AlertCircle size={15} strokeWidth={2.4} aria-hidden className="mt-[1px] shrink-0" />
                  {submitError}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-[12px] bg-field px-5 text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileHover={submitting ? undefined : { y: -1 }}
                  whileTap={submitting ? undefined : { scale: 0.98, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex h-11 items-center gap-2 rounded-[12px] bg-brand px-6 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark active:bg-brand-press disabled:cursor-wait disabled:opacity-80"
                >
                  {submitting && <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />}
                  {submitting ? "Posting…" : "Post Event"}
                </motion.button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
