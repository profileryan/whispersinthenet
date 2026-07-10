"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ViewMode } from "@/lib/traces";

type NavOption<T extends string> = {
  value: T;
  label: string;
};

type NavDropdownProps<T extends string> = {
  label: string;
  value: T;
  options: Array<NavOption<T>>;
  onChange: (value: T) => void;
  className?: string;
};

export function NavDropdown<T extends string>({ label, value, options, onChange, className = "" }: NavDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const dropdownId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  function setDropdownOpen(nextOpen: boolean) {
    if (nextOpen && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("traces:navigation-dropdown-open", { detail: dropdownId }));
    }
    setOpen(nextOpen);
  }

  useEffect(() => {
    function handlePeerOpen(event: Event) {
      if (event instanceof CustomEvent && event.detail !== dropdownId) {
        setOpen(false);
      }
    }

    window.addEventListener("traces:navigation-dropdown-open", handlePeerOpen);
    return () => window.removeEventListener("traces:navigation-dropdown-open", handlePeerOpen);
  }, [dropdownId]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".nav-dropdown-trigger")?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function moveSelection(delta: number) {
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest(".nav-dropdown-menu")) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setDropdownOpen(true);
        return;
      }
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setDropdownOpen(!open);
    }
  }

  return (
    <div ref={rootRef} className={`nav-dropdown ${className} ${open ? "is-open" : ""}`} onKeyDown={handleKeyDown}>
      <span className="nav-dropdown-label">{label}</span>
      <button
        type="button"
        className="nav-dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setDropdownOpen(!open);
        }}
      >
        {selected.label}
        <span className="nav-dropdown-caret" aria-hidden="true" />
      </button>
      <div className="nav-dropdown-menu" role="menu" aria-label={label} aria-hidden={!open}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            tabIndex={open ? 0 : -1}
            className={option.value === value ? "is-selected" : ""}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <NavDropdown
      label="Explore In:"
      value={mode}
      onChange={onChange}
      options={[
        { value: "map", label: "Map View" },
        { value: "immersive", label: "Immersive View" },
      ]}
    />
  );
}
