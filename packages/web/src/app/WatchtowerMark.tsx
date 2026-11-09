/**
 * The emblem: a watchtower whose flame never goes out — Ésaïe 62:6, "Sur tes murs, j'ai placé
 * des gardes ; ils ne se tairont ni jour ni nuit." Decorative: the name next to it carries the
 * meaning for screen readers.
 */
export function WatchtowerMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="watchtower-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="wt-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wt-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f2a33a" />
          <stop offset="0.6" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#fff4cf" />
        </linearGradient>
        <linearGradient id="wt-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1d79a" />
          <stop offset="1" stopColor="#b8893a" />
        </linearGradient>
      </defs>
      <circle className="watchtower-glow" cx="24" cy="10" r="10" fill="url(#wt-glow)" />
      <path className="watchtower-flame" d="M24 3.5c2.6 3 3.9 5.2 3.9 7.2a3.9 3.9 0 0 1-7.8 0c0-1.3.6-2.5 1.6-3.6.2 1.2.8 1.9 1.6 2.2-.4-2 .1-3.9.7-5.8Z" fill="url(#wt-flame)" />
      {/* Battlements */}
      <path d="M14 17h3v2h3v-2h3v2h2v-2h3v2h3v-2h3v5H14Z" fill="url(#wt-stone)" />
      {/* Tower, slightly tapered */}
      <path d="M16 22h16l2 21H14Z" fill="url(#wt-stone)" />
      {/* Lit window and door */}
      <path d="M22 26.5a2 2 0 0 1 4 0V31h-4Z" fill="#ffe7a8" />
      <path d="M21 43v-5a3 3 0 0 1 6 0v5Z" fill="#1b2147" opacity="0.85" />
      {/* Ground */}
      <path d="M8 43.5h32" stroke="#d9b56a" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
