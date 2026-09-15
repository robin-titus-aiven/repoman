import { useCallback, useEffect, useState } from 'react';

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** Shared with the inline script in index.html that sets the theme before paint. */
const STORAGE_KEY = 'cucina-color-scheme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Storage access throws in some privacy modes, so every use is guarded.
const readStoredScheme = (): ColorScheme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
};

const systemScheme = (): ColorScheme =>
  window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';

/**
 * Tracks the active color scheme and mirrors it onto `<html data-theme>`, which
 * is the selector `theme.css` hangs the dark Aquarium tokens off.
 */
export function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>(
    () => readStoredScheme() ?? systemScheme(),
  );
  const [followSystem, setFollowSystem] = useState(() => readStoredScheme() === null);

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
  }, [scheme]);

  // Until someone picks a scheme explicitly, keep tracking the OS setting.
  useEffect(() => {
    if (!followSystem) {
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const sync = () => setScheme(query.matches ? 'dark' : 'light');
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [followSystem]);

  const chooseScheme = useCallback((next: ColorScheme) => {
    setFollowSystem(false);
    setScheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A scheme that can't be persisted still applies for this session.
    }
  }, []);

  return { scheme, chooseScheme };
}
