/**
 * Converts between the two representations of a Big Five trait score:
 * the 0-100 scale stored on `Persona` and the 1-5 scale the variation
 * sliders operate on. `mapToDiscrete` rounds and clamps to 1-5, so any
 * 0-100 input is safe; `mapFromDiscrete` assumes an in-range 1-5 input
 * and does not clamp.
 */
export function mapToDiscrete(val: number): number {
  return Math.min(5, Math.max(1, Math.round(val / 20)))
}

export function mapFromDiscrete(val: number): number {
  return val * 20
}
