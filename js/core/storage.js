/**
 * Browser storage that never throws (private mode, blocked storage, previews…). A failed read returns null.
 */
function area(name) {
  try { return window[name]; } catch { return null; }
}

function make(name) {
  return {
    get(key) { try { return area(name)?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { try { area(name)?.setItem(key, value); } catch { /* not kept */ } },
    remove(key) { try { area(name)?.removeItem(key); } catch { /* ignore */ } },
  };
}

export const local = make('localStorage');
export const session = make('sessionStorage');
