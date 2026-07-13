/**
 * Jewel-ERP brand mark — a faceted gold gem set on a dark rounded badge, so it
 * reads as a proper app icon (with contrast) everywhere it appears. Self-contained
 * SVG (own gradients), matching the desktop app icon.
 */
export function Logo({ className, title = "Jewel-ERP" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="jewelBadge" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2A2620" />
          <stop offset="1" stopColor="#141210" />
        </linearGradient>
        <linearGradient id="jewelGold" x1="14" y1="12" x2="34" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6D98B" />
          <stop offset="0.5" stopColor="#D9A94E" />
          <stop offset="1" stopColor="#B07A1E" />
        </linearGradient>
        <radialGradient id="jewelGlow" cx="24" cy="17" r="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E7BE6A" stopOpacity="0.30" />
          <stop offset="1" stopColor="#E7BE6A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* dark badge */}
      <rect x="1" y="1" width="46" height="46" rx="11" fill="url(#jewelBadge)" />
      <rect x="1" y="1" width="46" height="46" rx="11" fill="url(#jewelGlow)" />
      <rect x="1.75" y="1.75" width="44.5" height="44.5" rx="10" fill="none" stroke="#D9A94E" strokeOpacity="0.25" strokeWidth="0.6" />
      {/* gem, scaled to sit inside the badge with padding */}
      <g transform="translate(24 25.5) scale(0.8) translate(-24 -28)">
        <path d="M16 12 H32 L42 22 L24 44 L6 22 Z" fill="url(#jewelGold)" />
        <path d="M6 22 L24 44 L24 22 Z" fill="#000000" fillOpacity="0.12" />
        <path d="M16 12 H32 L34 22 H14 Z" fill="#FFFFFF" fillOpacity="0.22" />
        <g stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="1" strokeLinejoin="round" strokeLinecap="butt" vectorEffect="non-scaling-stroke">
          <path d="M6 22 H42 M16 12 L14 22 M32 12 L34 22 M24 12 V22 M14 22 L24 44 M34 22 L24 44 M24 22 V44" />
        </g>
        <path d="M16 12 H32 L42 22 L24 44 L6 22 Z" fill="none" stroke="#7D5211" strokeWidth="1.3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}
