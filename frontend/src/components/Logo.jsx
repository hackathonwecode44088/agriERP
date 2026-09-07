export const LogoMark = ({ className = "h-9 w-9", tone = "dark" }) => {
  const tile = tone === "light" ? "#FFFFFF" : "#2A5C43";
  const grid = tone === "light" ? "#2A5C43" : "#FFFFFF";
  const leaf = tone === "light" ? "#2A5C43" : "#E8C16B";
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="AgriERP">
      <rect width="40" height="40" rx="11" fill={tile} />
      <g stroke={grid} strokeOpacity={tone === "light" ? "0.16" : "0.22"} strokeWidth="1">
        <path d="M0 13h40M0 20h40M0 27h40M13 0v40M20 0v40M27 0v40" />
      </g>
      <path
        d="M20 31V17.5"
        stroke={leaf}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M20 18.4c0-4.2 2.6-7.2 7-7.9.5 4.9-2.3 8.2-7 7.9z"
        fill={leaf}
      />
      <path
        d="M19.6 22.6c-3.4-.3-5.7-2.6-6.2-6.3 3.9.2 6.3 2.4 6.2 6.3z"
        fill={leaf}
        fillOpacity="0.75"
      />
    </svg>
  );
};

export const Logo = ({ tone = "dark", className = "", markClass = "h-9 w-9", subtitle }) => (
  <span className={`flex items-center gap-2.5 ${className}`}>
    <LogoMark className={markClass} tone={tone} />
    <span className="flex flex-col leading-none">
      <span
        className={`font-head text-[17px] font-extrabold tracking-tight ${
          tone === "dark" ? "text-white" : "text-foreground"
        }`}
      >
        Agri<span className={tone === "dark" ? "text-accent" : "text-primary"}>ERP</span>
      </span>
      {subtitle && (
        <span
          className={`mt-1 text-[9px] uppercase tracking-[0.22em] ${
            tone === "dark" ? "text-white/45" : "text-muted-foreground"
          }`}
        >
          {subtitle}
        </span>
      )}
    </span>
  </span>
);

export default Logo;
