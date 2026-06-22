'use client';

import { useEffect, useState } from 'react';
import {
  deleteAnthropicKey,
  getAnthropicKey,
  setAnthropicKey,
} from '../data/secureStore';

const KEYS_URL = 'https://console.anthropic.com/settings/keys';

/** sk-ant-…1234 — never echoes the full key. */
function mask(key: string): string {
  const last4 = key.slice(-4);
  return `sk-ant-…${last4}`;
}

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Fired after a save or remove so the screen can refresh its "has key" flag. */
  onKeyChanged?: () => void;
}

export function SettingsModal({ visible, onClose, onKeyChanged }: SettingsModalProps) {
  // The currently-stored key (masked in the UI), or null if none is set.
  const [storedKey, setStoredKey] = useState<string | null>(null);
  // The draft the user is typing — never pre-filled with the real key.
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Load the current key each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setDraft('');
    setNotice(null);
    (async () => {
      const k = await getAnthropicKey();
      if (!cancelled) setStoredKey(k);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  const save = async () => {
    const value = draft.trim();
    if (!value) {
      setNotice('Paste a key first.');
      return;
    }
    setBusy(true);
    try {
      await setAnthropicKey(value);
      setStoredKey(value);
      setDraft('');
      onKeyChanged?.();
      onClose();
    } catch {
      setNotice('Could not save the key on this device.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteAnthropicKey();
      setStoredKey(null);
      setDraft('');
      setNotice('Key removed from this device.');
      onKeyChanged?.();
    } catch {
      setNotice('Could not remove the key.');
    } finally {
      setBusy(false);
    }
  };

  // Pull the key straight from the clipboard (browser permission permitting).
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setNotice('Clipboard is empty — copy your key first.');
        return;
      }
      setDraft(text);
      setNotice('Key pasted — click Save.');
    } catch {
      setNotice('Could not read the clipboard — paste into the field instead.');
    }
  };

  // Soft validation: warn but don't block keys that don't match the prefix.
  const looksValid = draft.trim() === '' || draft.trim().startsWith('sk-ant-');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[20px] border border-border bg-card p-6 pb-12 sm:rounded-2xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-extrabold text-fg">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg text-[15px] font-bold text-muted"
          >
            ✕
          </button>
        </div>

        <h3 className="mb-2 mt-2 text-base font-bold text-fg">
          AI thesis (optional: your own key)
        </h3>

        <p className="mb-2 text-sm leading-relaxed text-muted">
          Theses work out of the box using a shared key — no setup needed. Adding
          your own Anthropic API key is optional: it runs theses on your own quota
          instead, and is stored only in this browser (we never see or store it).
        </p>

        <p className="mb-2 text-sm leading-relaxed text-muted">
          Get a key at{' '}
          <a
            href={KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent"
          >
            console.anthropic.com/settings/keys
          </a>
        </p>

        {storedKey ? (
          <div className="my-2 flex items-center justify-between rounded-xl border border-border bg-bg p-4">
            <div className="flex-1">
              <div className="mb-0.5 text-xs text-muted">Key on this device</div>
              <div className="text-base font-bold text-fg">{mask(storedKey)}</div>
            </div>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-4 rounded-[10px] border border-red px-4 py-2 text-sm font-bold text-red disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : null}

        <div className="mb-1 mt-2 text-xs text-muted">
          {storedKey ? 'Replace key' : 'Paste your key'}
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (notice) setNotice(null);
            }}
            placeholder="sk-ant-..."
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="flex-1 rounded-xl border border-border bg-bg px-4 py-3 text-base text-fg placeholder:text-muted"
          />
          <button
            type="button"
            onClick={paste}
            disabled={busy}
            className="rounded-xl border border-accent bg-bg px-4 text-[15px] font-bold text-accent disabled:opacity-50"
          >
            Paste
          </button>
        </div>

        {!looksValid ? (
          <p className="mt-2 text-[13px] leading-tight text-amber">
            This doesn’t look like an Anthropic key (they start with “sk-ant-”).
            You can still save it.
          </p>
        ) : null}

        {notice ? <p className="mt-2 text-[13px] text-muted">{notice}</p> : null}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-accent py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
