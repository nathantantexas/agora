/**
 * Recovery from a deploy that happened underneath an open tab.
 *
 * Every build renames its chunks by content hash, and a change anywhere in shared code
 * renames every lazily loaded page with it. A tab opened before a deploy still holds the
 * old page, so the next time it lazy-loads a route it asks for a file that no longer
 * exists. The symptom is the error boundary on an otherwise healthy page. One reload
 * fetches the current index and clears it; the guard keeps a genuine outage from looping.
 */
const KEY = 'agora.reloaded-for-update';
const WINDOW_MS = 60 * 1000;
let pending = false;

export function isChunkLoadError(err) {
  const msg = String((err && err.message) || err || '');
  return /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|preload/i.test(msg);
}

/** True between the decision to reload and the page actually going away. */
export function isReloadPending() {
  return pending;
}

/** Reload, unless a reload for this reason already happened in the last minute. */
export function reloadOnce() {
  if (pending) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* no sessionStorage: reload anyway, the window guard is a nicety */
  }
  pending = true;
  window.location.reload();
  return true;
}
