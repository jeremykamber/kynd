#!/usr/bin/env python3
"""Assemble the refactor briefing.

The briefing must contain the complete text of both design books, not paths to
them: the agent reading the prompt has then certainly seen the whole work.
Substitution is plain string replacement, so book text is never interpreted as
a pattern.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REQUIRED_TOKENS = (
    "{{RUN_DATE}}",
    "{{BASE_SHA}}",
    "{{DIFF_SUMMARY}}",
    "{{PRIOR_LOG}}",
    "{{METRICS}}",
    "{{BOOK_PSD}}",
    "{{BOOK_FOWLER}}",
)

MIN_BOOK_CHARS = 100_000


def read(path: Path, what: str) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        sys.exit(f"build-prompt: cannot read {what} at {path}: {exc}")
    if not text.strip():
        sys.exit(f"build-prompt: {what} at {path} is empty")
    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--psd", required=True)
    parser.add_argument("--fowler", required=True)
    parser.add_argument("--diff", required=True)
    parser.add_argument("--log", required=True)
    parser.add_argument("--metrics", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--run-date", required=True)
    args = parser.parse_args()

    psd = read(Path(args.psd), "Philosophy of Software Design")
    fowler = read(Path(args.fowler), "Refactoring")
    if len(psd) < MIN_BOOK_CHARS or len(fowler) < MIN_BOOK_CHARS:
        sys.exit(
            "build-prompt: book text looks truncated "
            f"(psd={len(psd)} chars, fowler={len(fowler)} chars, "
            f"minimum {MIN_BOOK_CHARS}); refusing to run without the full text"
        )

    template = read(Path(args.template), "prompt template")
    missing = [token for token in REQUIRED_TOKENS if token not in template]
    if missing:
        sys.exit(f"build-prompt: template lacks {', '.join(missing)}")

    values = {
        "{{RUN_DATE}}": args.run_date,
        "{{BASE_SHA}}": args.base,
        "{{DIFF_SUMMARY}}": read(Path(args.diff), "diff summary"),
        "{{PRIOR_LOG}}": read(Path(args.log), "refactor log"),
        "{{METRICS}}": read(Path(args.metrics), "metrics"),
        "{{BOOK_PSD}}": psd,
        "{{BOOK_FOWLER}}": fowler,
    }

    prompt = template
    for token, value in values.items():
        prompt = prompt.replace(token, value)

    Path(args.out).write_text(prompt, encoding="utf-8")
    print(f"build-prompt: wrote {args.out} ({len(prompt):,} chars)")


if __name__ == "__main__":
    main()
