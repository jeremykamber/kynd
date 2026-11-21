#!/usr/bin/env python3
"""Decide whether a test run introduced failures, compared with a baseline.

A repository can already have a failing test when the run starts. The steward
must not treat that as its own regression, and it also must not hide a new one.
This compares the failing test identities of two vitest JSON reports.

Exit codes: 0 = no new failures, 1 = new failures, 2 = the report is missing or
unreadable (the gate cannot be judged, so it fails).

Usage:
  compare-tests.py --baseline base.json --head head.json [--summary out.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def read_report(path: Path | None) -> dict:
    if path is None or not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def failures(report: dict) -> set[str]:
    """Stable identities of failing tests: '<file> :: <full name>'."""
    found: set[str] = set()
    for file_result in report.get("testResults", []):
        name = file_result.get("name", "<unknown file>")
        assertions = file_result.get("assertionResults", [])
        failed_assertions = [a for a in assertions if a.get("status") == "failed"]
        for assertion in failed_assertions:
            full = assertion.get("fullName") or assertion.get("title") or "<unnamed test>"
            found.add(f"{name} :: {full}")
        if file_result.get("status") == "failed" and not failed_assertions:
            # The file failed to collect, or a hook threw: treat it as one unit.
            found.add(f"{name} :: <file>")
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--summary")
    args = parser.parse_args()

    head_path = Path(args.head)
    if not head_path.exists() or head_path.stat().st_size == 0:
        sys.exit(f"compare-tests: no test report at {head_path}")

    head_report = read_report(head_path)
    if "testResults" not in head_report:
        sys.exit("compare-tests: head report has no testResults")

    baseline_path = Path(args.baseline) if args.baseline else None
    baseline_report = read_report(baseline_path)
    baseline = failures(baseline_report)
    head = failures(head_report)
    new = sorted(head - baseline)

    summary = {
        "baselineFailures": sorted(baseline),
        "headFailures": sorted(head),
        "newFailures": new,
        "baselineRecorded": bool(baseline_report),
        "totalTests": head_report.get("numTotalTests"),
        "totalPassed": head_report.get("numPassedTests"),
    }
    if args.summary:
        Path(args.summary).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    if baseline:
        print(f"compare-tests: {len(baseline)} failure(s) already present on the base commit")
    if new:
        print(f"compare-tests: {len(new)} NEW failure(s):")
        for item in new:
            print(f"  {item}")
        sys.exit(1)

    print(
        "compare-tests: no new failures "
        f"({len(head)} pre-existing, {summary['totalPassed']}/{summary['totalTests']} passed)"
    )


if __name__ == "__main__":
    main()
