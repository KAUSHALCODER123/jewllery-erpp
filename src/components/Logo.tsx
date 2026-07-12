/**
 * Jewel-ERP brand mark — a faceted brilliant-cut gem in warm gold. Self-contained
 * SVG (own gradient) so it looks the same in the sidebar, login and app icon.
 */
export function Logo({ className, title = "Jewel-ERP" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="jewelGold" x1="8" y1="8" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6D98B" />
          <stop offset="0.5" stopColor="#D9A94E" />
          <stop offset="1" stopColor="#B07A1E" />
        </linearGradient>
      </defs>
      {/* gem body */}
      <path d="M16 12 H32 L42 22 L24 44 L6 22 Z" fill="url(#jewelGold)" />
      {/* depth + highlight */}
      <path d="M6 22 L24 44 L24 22 Z" fill="#000000" fillOpacity="0.10" />
      <path d="M16 12 H32 L34 22 H14 Z" fill="#FFFFFF" fillOpacity="0.20" />
      {/* facet lines */}
      <g stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" strokeLinecap="butt">
        <path d="M6 22 H42 M16 12 L14 22 M32 12 L34 22 M24 12 V22 M14 22 L24 44 M34 22 L24 44 M24 22 V44" />
      </g>
      {/* outline */}
      <path d="M16 12 H32 L42 22 L24 44 L6 22 Z" stroke="#8A5A12" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
