import { getTraceTheme, type ThemeKey } from "@/lib/traces";

type Props = {
  theme: ThemeKey;
  compact?: boolean;
};

export function TraceMarkerIcon({ theme, compact = false }: Props) {
  const themeData = getTraceTheme(theme);
  return (
    <span
      className={`trace-glyph ${compact ? "is-compact" : ""}`}
      style={{ "--trace-color": themeData.color } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="trace-glyph-wave">∿</span>
      <span className="trace-glyph-dot" />
    </span>
  );
}
