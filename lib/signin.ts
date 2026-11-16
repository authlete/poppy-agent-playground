// Direct Sign-In in a new tab, so the main tab keeps all its state (no full-page redirect). The
// /callback page reports back over postMessage, with a localStorage fallback for when the AS's COOP
// header severs the opener. Resolves when the callback reports, or rejects "cancelled" if the tab closes.
import type { WireEntry } from "./types";

export const CALLBACK_TYPE = "poppy-callback";
export const CALLBACK_KEY = "poppy:callback";

export interface SignInResult {
  ok: boolean;
  message?: string;
  /** The authorization code returned to the callback (spent — shown as part of the flow). */
  code?: string;
  /** HTTP calls the callback made finishing the exchange (the token call), for the wire. */
  wire?: WireEntry[];
}

/** Open the sign-in tab synchronously in the click handler (so it isn't blocked), then navigate it. A
 *  plain `_blank` with no features string is a new tab, not a popup window. */
export function openSignInTab(): Window | null {
  return window.open("", "_blank");
}

export function awaitSignIn(tab: Window, signal: AbortSignal): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      cleanup();
      fn();
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      const d = e.data as { type?: string } & SignInResult;
      if (d?.type !== CALLBACK_TYPE) return;
      finish(() => resolve({ ok: !!d.ok, message: d.message, code: d.code, wire: d.wire }));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CALLBACK_KEY || !e.newValue) return;
      try {
        const d = JSON.parse(e.newValue) as SignInResult;
        finish(() => resolve({ ok: !!d.ok, message: d.message, code: d.code, wire: d.wire }));
      } catch {
        /* ignore */
      }
    };
    // Cancel is explicit (the main tab's Cancel button). We do NOT poll `tab.closed`: the AS's COOP
    // header severs the opener handle on navigation, so `tab.closed` reads true immediately and would
    // report a false cancel.
    const onAbort = () => {
      try {
        tab.close();
      } catch {
        /* ignore */
      }
      finish(() => reject(new Error("cancelled")));
    };

    function cleanup() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      signal.removeEventListener("abort", onAbort);
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    signal.addEventListener("abort", onAbort);
  });
}
