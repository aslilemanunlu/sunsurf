import { useT, type Lang } from '../lib/i18n';

const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'tr', label: 'TR' },
  { value: 'en', label: 'EN' },
];

export default function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="lang" role="group" aria-label="Language">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`lang-btn${lang === o.value ? ' is-active' : ''}`}
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
