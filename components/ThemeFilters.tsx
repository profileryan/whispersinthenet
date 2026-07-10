"use client";

import type { ThemeKey, TraceTheme } from "@/lib/traces";

type Props = {
  themes: TraceTheme[];
  enabledThemes: Set<ThemeKey>;
  onToggle: (theme: ThemeKey) => void;
  animationKey: string | number;
};

export function ThemeFilters({ themes, enabledThemes, onToggle, animationKey }: Props) {
  return (
    <div
      key={animationKey}
      className="theme-filters"
      aria-label="Trace theme filters"
      style={
        {
          "--theme-count": themes.length,
          "--theme-min-column": themes.length <= 5 ? "130px" : "110px",
        } as React.CSSProperties
      }
    >
      {themes.map((theme) => {
        const enabled = enabledThemes.has(theme.key);
        return (
          <button
            key={theme.key}
            className={enabled ? "is-enabled" : ""}
            style={{
              "--theme-color": theme.color,
              "--theme-text": theme.textColor,
            } as React.CSSProperties}
            onClick={() => onToggle(theme.key)}
            aria-pressed={enabled}
          >
            {theme.label}
          </button>
        );
      })}
    </div>
  );
}
