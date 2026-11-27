import { describe, expect, it } from "vitest";
import { emptyVerdictCounts, normalizeVerdict } from "../Verdict";

describe("normalizeVerdict", () => {
  it("keeps every verdict from the fixed set", () => {
    for (const verdict of ["adopt", "trial", "reject", "undecided"] as const) {
      expect(normalizeVerdict(verdict)).toBe(verdict);
    }
  });

  it("turns an unknown or missing verdict into undecided", () => {
    expect(normalizeVerdict("maybe")).toBe("undecided");
    expect(normalizeVerdict(undefined)).toBe("undecided");
    expect(normalizeVerdict(3)).toBe("undecided");
  });

  it("starts every count at zero", () => {
    expect(emptyVerdictCounts()).toEqual({ adopt: 0, trial: 0, reject: 0, undecided: 0 });
  });
});
