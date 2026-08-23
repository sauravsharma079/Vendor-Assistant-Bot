// Veltriance "V" mark — two diagonal strokes converging to a point, left
// stroke solid navy, right stroke carrying a diagonal gold band clipped to
// its silhouette. Colors match app/globals.css (--color-navy, --color-accent).
export function VeltrianceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="veltriance-right-stroke">
          <polygon points="232,8 186,8 118,225 140,225" />
        </clipPath>
      </defs>

      {/* Left stroke — solid navy */}
      <polygon points="8,8 54,8 122,225 100,225" fill="#0f1729" />

      {/* Right stroke — navy base, gold diagonal band clipped to its shape */}
      <polygon points="232,8 186,8 118,225 140,225" fill="#0f1729" />
      <polygon points="150,-10 205,-10 115,250 60,250" fill="#C9A227" clipPath="url(#veltriance-right-stroke)" />
    </svg>
  );
}
