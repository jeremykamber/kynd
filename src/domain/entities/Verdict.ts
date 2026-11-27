/** The fixed verdict set. A role shapes reasoning; it never chooses the verdict. */
export const VERDICTS = ['adopt', 'trial', 'reject', 'undecided'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** A missing or invalid model verdict becomes `undecided`, so counts still sum. */
export function normalizeVerdict(value: unknown): Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value)
    ? (value as Verdict)
    : 'undecided';
}

export function emptyVerdictCounts(): Record<Verdict, number> {
  return { adopt: 0, trial: 0, reject: 0, undecided: 0 };
}
