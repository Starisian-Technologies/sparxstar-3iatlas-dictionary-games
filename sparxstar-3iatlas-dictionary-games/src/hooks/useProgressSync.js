/**
 * useProgressSync — queues game progress events in IndexedDB.
 *
 * Events are held in IndexedDB until Helios token introspection is
 * implemented (OQ-G1). syncNow() is intentionally a no-op for the
 * network POST until that open question is resolved. Events are written
 * to the outbox on a best-effort basis — writes may fail if IndexedDB is
 * unavailable (e.g. quota exceeded or private-browsing mode), and failures
 * are logged as warnings.
 *
 * SECURITY NOTE: Reading a Helios Bearer token from localStorage would
 * expose it to any injected script (XSS), undermining the platform's
 * token-integrity guarantee. The network sync path MUST NOT ship until
 * OQ-G1 is resolved with an approved token-delivery mechanism.
 *
 * // TODO: Replace with Helios token introspection when available (OQ-G1).
 */

import { useCallback, useEffect } from "react";
import { getRecord, putRecord } from "./idbUtils.js";

const OUTBOX_KEY = "progress-outbox:pending";
let addEventQueue = Promise.resolve();

/**
 * @param {object} _opts  Reserved — restUrl will be used once Helios auth is wired up.
 * @returns {{ addEvent: Function, syncNow: Function, syncing: boolean }}
 */
export function useProgressSync({ restUrl: _restUrl }) {
  /**
   * Add a progress event to the outbox.
   *
   * @param {object} event  e.g. { type: 'aiwa_game_word_correct', word_uuid: '...', game: 'listen_write' }
   */
  const addEvent = useCallback((event) => {
    const appendEvent = async () => {
      const outbox =
        typeof getRecord === "function"
          ? await getRecord("progress-outbox", OUTBOX_KEY)
          : null;
      const events = outbox?.events ?? [];

      if (typeof putRecord !== "function") {
        console.warn(
          "putRecord is unavailable; skipping progress outbox write.",
        );
        return;
      }

      await putRecord("progress-outbox", {
        key: OUTBOX_KEY,
        events: [...events, { ...event, ts: Date.now() }],
      }).then((ok) => {
        if (!ok) {
          console.warn(
            "useProgressSync: outbox write failed (storage unavailable); event may be lost.",
          );
        }
      });
    };

    const queuedAppend = addEventQueue.then(appendEvent, appendEvent);
    addEventQueue = queuedAppend.catch(() => {});
    return queuedAppend;
  }, []);

  /**
   * Network sync is intentionally disabled until OQ-G1 (Helios auth) is
   * resolved. Events accumulate in the IndexedDB outbox on a best-effort
   * basis (writes may fail if storage is unavailable; failures are logged).
   *
   * // TODO: Replace with Helios token introspection when available (OQ-G1).
   */
  const syncNow = useCallback(async () => {
    /* No-op: network POST is blocked until Helios token source is approved.
     * See OQ-G1. The IndexedDB outbox is the durable store for now. */
  }, []);

  /* Re-attempt sync on reconnect — currently a no-op; wired up for when
   * OQ-G1 is resolved so the listener is already in place. */
  useEffect(() => {
    const handler = () => syncNow();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [syncNow]);

  return { addEvent, syncNow, syncing: false };
}
