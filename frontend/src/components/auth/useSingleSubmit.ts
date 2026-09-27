"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Ignores a second submit that arrives before React has disabled the button.
 * Covers a double click and Enter repeating while the auth request is in flight.
 * This does not delay or skip the request Supabase uses for its own rate limit.
 */
export function useSingleSubmit() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);

  const start = useCallback(() => {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    return true;
  }, []);

  const finish = useCallback(() => {
    lock.current = false;
    setPending(false);
  }, []);

  return { pending, start, finish };
}
