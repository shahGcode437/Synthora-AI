export function Logo({ className = "size-9" }: { className?: string }) {
  return (
    <div className={`flex ${className} shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-gradient-to-br from-accent/20 to-sky-400/10 shadow-[0_0_24px_-6px_rgb(45_212_191/0.5)]`}>
      <svg viewBox="0 0 32 32" className="size-[55%]" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5eead4" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M9 21c0 2 2 3.5 7 3.5s7-1.5 7-3.5-2.5-3-7-3-7-1-7-3 2-3.5 7-3.5 7 1.5 7 3.5" />
      </svg>
    </div>
  );
}
