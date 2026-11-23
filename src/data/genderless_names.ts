/**
 * Curated gender-neutral first names.
 *
 * `neutralNames` shuffles a copy of this list with a seed derived from the
 * persona description and assigns the results to generated personas, so names
 * stay neutral and stable for the same input instead of being invented by the
 * model.
 */
export const GENDERLESS_NAMES = [
  "Ari",
  "Rowan",
  "Quinn",
  "Sage",
  "Kai",
  "Finley",
  "Harper",
  "Reese",
  "Elliot",
  "Phoenix",
  "River",
  "Sky",
  "Oak",
  "Emerson",
  "Dakota",
  "Indigo",
  "Taylor",
  "Morgan",
  "Riley",
  "Vale",
  "Avery",
  "Casey",
  "Jules",
  "Blair",
  "Sawyer",
  "Lane",
  "Parker",
  "Sasha",
  "Remy",
  "Tatum",
];

/**
 * Deterministic, seed-stable assignment of curated gender-neutral names:
 * FNV-1a hash of the seed text plus a mulberry32 shuffle, so the same seed
 * yields the same name order. Returns the first `count` names.
 */
export function neutralNames(seedText: string, count: number): string[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = (() => {
    let a = h >>> 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })();
  const copy = GENDERLESS_NAMES.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
