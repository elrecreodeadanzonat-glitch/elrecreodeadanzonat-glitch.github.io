// Small per-device conveniences (volume, mute). Storage can be unavailable (private mode) — never throw.
const KEY = 'libro-de-mama:prefs';

export interface Prefs {
  volume: number;
  muted: boolean;
}

const DEFAULTS: Prefs = { volume: 0.4, muted: false };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULTS.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULTS.muted,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// The name people sign comments and photos with, remembered on this device only.
const NAME_KEY = 'libro-de-mama:nombre';

export function loadName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, 60);
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim().slice(0, 60));
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}
