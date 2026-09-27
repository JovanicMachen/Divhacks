"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";

import type { AdminAction } from "@/lib/demo-codes";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

interface AdminEventDialogProps {
  event: CampusEvent | null;
  onClose: () => void;
  /** Sends the code to the server. Resolves with an error message, or null once done. */
  onConfirm: (action: AdminAction, code: string) => Promise<string | null>;
}

/** Temporary demo override: the code is checked by the server, never here. */
export function AdminEventDialog({ event, onClose, onConfirm }: AdminEventDialogProps) {
  return (
    <AnimatePresence>
      {event && <AdminDialog key={event.id} event={event} onClose={onClose} onConfirm={onConfirm} />}
    </AnimatePresence>
  );
}

function AdminDialog({ event, onClose, onConfirm }: AdminEventDialogProps & { event: CampusEvent }) {
  const titleId = useId();
  const bodyId = useId();
  const [action, setAction] = useState<AdminAction>("delete");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !working && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [working, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    if (!code.trim()) {
      setError("Enter the admin code.");
      return;
    }
    lock.current = true;
    setWorking(true);
    setError(null);
    const failure = await onConfirm(action, code);
    lock.current = false;
    setWorking(false);
    if (failure) {
      setError(failure);
      setCode("");
    }
  };

  const copy =
    action === "delete"
      ? { title: "Delete this event?", body: "This admin action permanently removes this event.", confirm: "Delete Event", busy: "Deleting…" }
      : {
          title: "Cancel this event?",
          body: "This admin action takes the event off the live map and keeps it in history as cancelled.",
          confirm: "Cancel Event",
          busy: "Cancelling…",
        };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && !working && onClose()}
    >
      <motion.form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onSubmit={submit}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-[420px] rounded-[20px] bg-panel p-6 shadow-[0_24px_60px_rgba(15,37,71,0.22)]"
      >
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-coral-soft text-coral-text">
          <ShieldAlert size={20} strokeWidth={2.3} />
        </span>
        <p className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.1em] text-faint">Admin Event Action</p>
        <h2 id={titleId} className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ink">
          {copy.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-[14.5px] font-medium leading-[1.45] text-muted">
          {copy.body} <span className="font-semibold text-ink-soft">“{event.title}”</span>
        </p>

        <div role="radiogroup" aria-label="Admin action" className="mt-4 grid grid-cols-2 gap-1 rounded-[12px] bg-field p-1">
          {(["delete", "cancel"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={action === value}
              onClick={() => setAction(value)}
              className={cn(
                "h-10 rounded-[9px] text-[14px] font-bold transition-colors",
                action === value ? "bg-panel text-ink shadow-pill" : "text-muted hover:text-ink",
              )}
            >
              {value === "delete" ? "Delete" : "Cancel event"}
            </button>
          ))}
        </div>

        <label htmlFor="admin-code" className="mb-[7px] mt-4 block text-[13px] font-bold text-ink-soft">
          Admin code
        </label>
        <input
          id="admin-code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          maxLength={32}
          className="h-11 w-full rounded-[12px] border border-line bg-field px-3.5 text-[15px] font-semibold tracking-[0.3em] text-ink outline-none focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
        />

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-[12px] bg-coral-soft px-3 py-2.5 text-[13.5px] font-semibold leading-[1.4] text-coral-text"
          >
            <AlertCircle size={16} strokeWidth={2.4} aria-hidden className="mt-[1px] shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 min-[420px]:flex-row min-[420px]:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="h-11 rounded-[12px] bg-field px-5 text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={working}
            className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#E0352B] px-5 text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(224_53_43_/_0.24)] transition-colors hover:bg-[#C92D24] disabled:cursor-wait disabled:opacity-75"
          >
            {working && <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />}
            {working ? copy.busy : copy.confirm}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
