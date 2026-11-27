// Browser storage as a convenience only. Every call may fail (private window,
// blocked storage, full quota); the page must work without it.

/** @returns {boolean} whether the value was stored */
export function saveState(key, obj) {
  try {
    window.localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

/** @returns {object|null} the stored value, or null if missing, unreadable or blocked */
export function loadState(key) {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

export function clearState(key) {
  try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ }
}
