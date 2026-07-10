export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function staggerDelays(count: number, stepMs: number, maxMs: number): number[] {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => Math.min(index * stepMs, maxMs));
}
