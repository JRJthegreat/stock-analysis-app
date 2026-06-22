// On-device storage for the user's Anthropic API key (BYOK).
//
// The key lives ONLY in the browser (localStorage) — never in our database. We
// are never the custodian of users' credentials. SSR-safe: every access guards
// `typeof window` so it no-ops during Next.js server rendering.

const KEY = 'anthropic_api_key';

const hasWindow = (): boolean => typeof window !== 'undefined';

export async function getAnthropicKey(): Promise<string | null> {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setAnthropicKey(value: string): Promise<void> {
  if (!hasWindow()) return;
  window.localStorage.setItem(KEY, value.trim());
}

export async function deleteAnthropicKey(): Promise<void> {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
