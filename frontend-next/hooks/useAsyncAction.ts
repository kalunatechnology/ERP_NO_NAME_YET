"use client";

import { useCallback, useRef, useState } from "react";

/** Synchronous single-flight lock plus renderable loading keys for UI actions. */
export function useAsyncAction() {
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const run = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (locks.current.has(key)) return undefined;
    locks.current.add(key);
    setPending((current) => ({ ...current, [key]: true }));
    try {
      return await action();
    } finally {
      locks.current.delete(key);
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, []);

  return { run, pending, isPending: (key: string) => Boolean(pending[key]), isBusy: Object.keys(pending).length > 0 };
}
