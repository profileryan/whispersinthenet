import assert from "node:assert/strict";
import test from "node:test";
import { prefersReducedMotion, staggerDelays } from "./motion.ts";

test("prefersReducedMotion is safe during SSR", () => {
  const originalWindow = globalThis.window;

  try {
    // @ts-expect-error Tests the runtime SSR branch where window is absent.
    delete globalThis.window;
    assert.equal(prefersReducedMotion(), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  }
});

test("prefersReducedMotion reads the reduce media query in the browser", () => {
  const originalWindow = globalThis.window;
  const queries: string[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia(query: string) {
        queries.push(query);
        return { matches: true };
      },
    },
    writable: true,
  });

  try {
    assert.equal(prefersReducedMotion(), true);
    assert.deepEqual(queries, ["(prefers-reduced-motion: reduce)"]);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  }
});

test("prefersReducedMotion treats missing matchMedia as no preference", () => {
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
    writable: true,
  });

  try {
    assert.equal(prefersReducedMotion(), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  }
});

test("staggerDelays returns capped incremental delays", () => {
  assert.deepEqual(staggerDelays(6, 45, 120), [0, 45, 90, 120, 120, 120]);
});

test("staggerDelays returns an empty list for non-positive counts", () => {
  assert.deepEqual(staggerDelays(0, 45, 120), []);
  assert.deepEqual(staggerDelays(-1, 45, 120), []);
});
