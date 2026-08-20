/**
 * Vanilla JavaScript useEffect & Reactive Side-Effect System
 * Meniru perilaku useEffect (React / Vue watchEffect) pada arsitektur Vanilla JS
 */

import { eventBus } from "./event-bus.js";

/**
 * useEffect implementation for Vanilla JavaScript ES Modules
 * @param {Function} effectCallback - Fungsi side-effect yang akan dijalankan
 * @param {Array<string|Function>} deps - Array dependencies (nama eventBus event atau fungsi getter)
 * @returns {Function} cleanup - Fungsi untuk membatalkan listener / effect
 */
export function useEffect(effectCallback, deps = []) {
  let prevValues = [];
  const cleanups = [];

  // Jika deps berisi nama event bus (misal: ["crm:updated", "company:changed"])
  deps.forEach((dep, index) => {
    if (typeof dep === "string") {
      const unsub = eventBus.on(dep, async (payload) => {
        try {
          await effectCallback(payload);
        } catch (err) {
          console.error(`[useEffect] Error executing effect on "${dep}":`, err);
        }
      });
      cleanups.push(unsub);
    } else if (typeof dep === "function") {
      // Getter dependency tracker
      try {
        prevValues[index] = dep();
      } catch {
        prevValues[index] = undefined;
      }
    }
  });

  // Jika ada function getters di dependencies, setup microtask check
  const getterDeps = deps.filter(d => typeof d === "function");
  if (getterDeps.length > 0) {
    const unsubGetter = eventBus.on("*", async () => {
      let hasChanged = false;
      deps.forEach((dep, index) => {
        if (typeof dep === "function") {
          try {
            const currentVal = dep();
            if (currentVal !== prevValues[index]) {
              hasChanged = true;
              prevValues[index] = currentVal;
            }
          } catch {
            // Ignore
          }
        }
      });
      if (hasChanged) {
        try {
          await effectCallback();
        } catch (err) {
          console.error("[useEffect] Error on getter change:", err);
        }
      }
    });
    cleanups.push(unsubGetter);
  }

  // Jalankan effect pertama kali (initial mount)
  try {
    const initCleanup = effectCallback();
    if (typeof initCleanup === "function") {
      cleanups.push(initCleanup);
    }
  } catch (err) {
    console.error("[useEffect] Error on initial effect run:", err);
  }

  // Return unsubscribe all function
  return () => {
    cleanups.forEach(fn => {
      try {
        if (typeof fn === "function") fn();
      } catch {
        // Ignore
      }
    });
  };
}

/**
 * Watch helper untuk mengamati perubahan properti state secara spesifik
 */
export function watch(getter, callback) {
  return useEffect(callback, [getter]);
}
