// The companion's settings, behind the gear on the start page. One choice for now: the language it speaks.
// Automatic (the default) answers in whichever of English, Spanish or French it hears; a pinned language is always
// spoken. Remembered on this device; the next visit uses it. The panel sits at the side so the companion stays in view.
import { useEffect, useRef } from 'react';
import { NATIVE_NAME, type LanguageSetting } from '../../../../packages/shared/src/language';
import { useGate } from '../state/store';
import { CloseIcon, GearIcon } from './Icons';

const CHOICES: { setting: LanguageSetting; label: string; lang?: string }[] = [
  { setting: 'auto', label: 'Automatic' },
  { setting: 'en', label: NATIVE_NAME.en, lang: 'en' },
  { setting: 'es', label: NATIVE_NAME.es, lang: 'es' },
  { setting: 'fr', label: NATIVE_NAME.fr, lang: 'fr' },
];

const EXPLAIN: Record<LanguageSetting, string> = {
  auto: 'Listens for English, Spanish and French, and answers in whichever it hears.',
  en: 'Always speaks English.',
  es: 'Always speaks Spanish · Siempre habla en español.',
  fr: 'Always speaks French · Parle toujours en français.',
};

export function SettingsButton() {
  return (
    <button type="button" className="icon-btn glass" aria-label="Companion settings" title="Companion settings" onClick={() => useGate.getState().set({ settingsOpen: true })} data-testid="open-settings">
      <GearIcon />
    </button>
  );
}

export function CompanionSettings() {
  const open = useGate((s) => s.settingsOpen);
  const language = useGate((s) => s.language);
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLInputElement>('input[name="companion-language"]:checked')?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop side" onClick={close}>
      <section ref={sheet} className="sheet glass settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-h" onClick={(e) => e.stopPropagation()} data-testid="settings-sheet">
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={close}><CloseIcon /></button>
        <h2 id="settings-h">Your companion</h2>
        <fieldset className="lang-field">
          <legend>Language</legend>
          <div className="lang-choices">
            {CHOICES.map((c) => (
              <label key={c.setting} className="lang-choice" lang={c.lang}>
                <input type="radio" name="companion-language" value={c.setting} checked={language === c.setting} onChange={() => useGate.getState().setLanguage(c.setting)} data-testid={`language-${c.setting}`} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <p className="lang-note" aria-live="polite">{EXPLAIN[language]}</p>
        </fieldset>
        <button type="button" className="pill glass settings-done" onClick={close} data-testid="settings-done">Done</button>
      </section>
    </div>
  );
}

/** Close the panel and give focus back to the gear that opened it. */
function close() {
  useGate.getState().set({ settingsOpen: false });
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="open-settings"]')?.focus());
}
