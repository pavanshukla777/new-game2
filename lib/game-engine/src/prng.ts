// ============================================================================
// Bundelkhandi Chhakri — Random Number Generators
// ============================================================================
//
// All shuffle operations accept a RangeRng so tests can inject a seeded,
// deterministic PRNG while production uses cryptographic randomness.
//
// RangeRng contract: given max, returns an integer in [0, max).
// ============================================================================

import { randomInt } from "node:crypto";
import type { RangeRng } from "./types.js";

/**
 * Cryptographically secure RNG using Node.js `crypto.randomInt`.
 * This is the default used in production.
 */
export const cryptoRng: RangeRng = (max: number): number => {
  if (max <= 0) throw new RangeError(`max must be > 0, got ${max}`);
  if (max === 1) return 0;
  return randomInt(max);
};

/**
 * Mulberry32 — a fast, high-quality 32-bit seeded PRNG.
 * Used in tests to produce fully deterministic, reproducible shuffles.
 *
 * @param seed  Any 32-bit integer seed. Different seeds produce different sequences.
 */
export function createSeededRng(seed: number): RangeRng {
  let s = seed >>> 0; // coerce to uint32

  return (max: number): number => {
    if (max <= 0) throw new RangeError(`max must be > 0, got ${max}`);
    if (max === 1) return 0;

    // Mulberry32 step
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // → [0, 1)

    return Math.floor(rand * max); // → [0, max)
  };
}

/**
 * Deterministic RNG that cycles through a fixed sequence of values.
 * Useful for hand-crafting specific test scenarios.
 *
 * @param values  Pre-defined sequence of [0, 1) values to return in order.
 *                Cycles back to the start when exhausted.
 */
export function createFixedRng(values: number[]): RangeRng {
  if (values.length === 0) throw new Error("values must not be empty");
  let index = 0;

  return (max: number): number => {
    const v = values[index % values.length];
    index++;
    return Math.floor(v * max);
  };
}
