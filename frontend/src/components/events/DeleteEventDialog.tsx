"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CalendarX2, Loader2, Trash2 } from "lucide-react";

import type { CampusEvent } from "@/types/event";

interface DeleteEventDialogProps {
  /** The event awaiting confirmation; null keeps the dialog closed. */
  event: CampusEvent | null;
  onCancel: () => void;
  /** Resolves with a user-facing error message, or null once done. */
  onConfirm: () => Promise<string | null>;
  /** Delete removes the event; cancel keeps it as history and takes it off the live map. */
  variant?: "delete" | "cancel";
}

interface DialogCopy {
  title: string;
  body: (eventTitle: string) => string;
  keep: string;
  confirm: string;
  working: string;
}

const COPY: Record<"delete" | "cancel", DialogCopy> = {
  delete: {
    title: "Delete event?",
    body: (title: string) => `Are you sure you want to delete “${title}”? This will permanently remove the event.`,
    keep: "Cancel",
    confirm: "Delete Event",
    working: "Deleting…",
  },
  cancel: {
    title: "Cancel this event?",
    body: () =>
      "This will remove the event from the live campus map and notify students who are going or have saved it.",
    keep: "Keep Event",
    confirm: "Cancel Event",
    working: "Cancelling…",
  },
};

export function DeleteEventDialog({ event, onCancel, onConfirm, variant = "delete" }: DeleteEventDialogProps) {
  return (
    <AnimatePresence>
      {event && (
        <ConfirmDelete key={event.id} event={event} onCancel={onCancel} onConfirm={onConfirm} variant={variant} />
      )}
    </AnimatePresence>
  );
}

function ConfirmDelete({
  event,
  onCancel,
  onConfirm,
  variant = "delete",
}: DeleteEventDialogProps & { event: CampusEvent }) {
  const copy = COPY[variant];
  const Icon = variant === "cancel" ? CalendarX2 : Trash2;
  const titleId = useId();
  const bodyId = useId();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleting, onCancel]);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    const message = await onConfirm();
    if (message) {
      setError(message);
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && !deleting && onCancel()}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={deleting || undefined}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-[420px] rounded-[20px] bg-panel p-6 shadow-[0_24px_60px_rgba(15,37,71,0.22)]"
      >
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-coral-soft text-coral-text">
          <Icon size={20} strokeWidth={2.3} />
        </span>
        <h2 id={titleId} className="mt-4 text-[20px] font-extrabold tracking-[-0.02em] text-ink">
          {copy.title}
        </h2>
        <p id={bodyId} className="mt-1.5 break-words text-[14.5px] font-medium leading-[1.45] text-muted">
          {copy.body(event.title)}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-[12px] bg-coral-soft px-3 py-2.5 text-[13.5px] font-semibold leading-[1.4] text-coral-text"
          >
            <AlertCircle size={16} strokeWidth={2.4} aria-hidden className="mt-[1px] shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 min-[420px]:flex-row min-[420px]:justify-end">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={deleting}
            className="h-11 rounded-[12px] bg-field px-5 text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.keep}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#E0352B] px-5 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(224_53_43_/_0.24)] transition-colors hover:bg-[#C92D24] disabled:cursor-not-allowed disabled:opacity-75"
          >
            {deleting && <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />}
            {deleting ? copy.working : copy.confirm}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
