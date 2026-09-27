"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

import type { CampusEvent } from "@/types/event";

interface DeleteEventDialogProps {
  /** The event awaiting confirmation; null keeps the dialog closed. */
  event: CampusEvent | null;
  onCancel: () => void;
  /** Resolves with a user-facing error message, or null once deleted. */
  onConfirm: () => Promise<string | null>;
}

export function DeleteEventDialog({ event, onCancel, onConfirm }: DeleteEventDialogProps) {
  return (
    <AnimatePresence>
      {event && <ConfirmDelete key={event.id} event={event} onCancel={onCancel} onConfirm={onConfirm} />}
    </AnimatePresence>
  );
}

function ConfirmDelete({ event, onCancel, onConfirm }: DeleteEventDialogProps & { event: CampusEvent }) {
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
          <Trash2 size={20} strokeWidth={2.3} />
        </span>
        <h2 id={titleId} className="mt-4 text-[20px] font-extrabold tracking-[-0.02em] text-ink">
          Delete event?
        </h2>
        <p id={bodyId} className="mt-1.5 break-words text-[14.5px] font-medium leading-[1.45] text-muted">
          Are you sure you want to delete &ldquo;{event.title}&rdquo;? This will permanently remove the event.
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
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#E0352B] px-5 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(224_53_43_/_0.24)] transition-colors hover:bg-[#C92D24] disabled:cursor-not-allowed disabled:opacity-75"
          >
            {deleting && <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />}
            {deleting ? "Deleting…" : "Delete Event"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
