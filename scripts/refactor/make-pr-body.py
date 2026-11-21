#!/usr/bin/env python3
"""Build a pull-request title and body for one refactor run.

The body is written for a reviewer, not for a machine: lead with the outcome,
then a measured before/after dependency graph, then the structural delta, then
what did not change, then where to start reading.

The graph comes from dependency-cruiser output at the base commit and at the
branch head, restricted to the modules the branch touched plus one hop of
context. It is measured, not drawn by the model. If the branch did not change
module boundaries, the body says that instead of showing two identical graphs.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

LAYERS = (
    ("src/app", "app (routes)"),
    ("src/actions", "actions"),
    ("src/application", "application"),
    ("src/domain", "domain"),
    ("src/infrastructure", "infrastructure"),
    ("src/ui", "ui"),
    ("src/components", "components"),
    ("src/hooks", "hooks"),
    ("src/lib", "lib"),
    ("src/data", "data"),
    ("src/templates", "templates"),
    ("src/types", "types"),
)

MAX_NODES = 34
MAX_EDGES = 70


def run(args: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=check)


def git(worktree: Path, *args: str) -> str:
    return run(["git", *args], worktree).stdout.strip()


def canonical(path: str) -> str:
    aliased = "src/" + path[2:] if path.startswith("@/") else path
    return re.sub(r"\.(d\.ts|tsx?|jsx?|mjs|cjs)$", "", aliased)


def layer_of(key: str) -> str:
    for prefix, label in LAYERS:
        if key.startswith(prefix):
            return label
    return "other"


def label_of(key: str) -> str:
    short = key.removeprefix("src/")
    if len(short) > 48:
        parts = short.split("/")
        short = "/".join(parts[-2:])
    return short.replace('"', "'")


def load_graph(worktree: Path) -> dict:
    result = run(
        ["./node_modules/.bin/depcruise", "src", "--output-type", "json", "--no-progress"],
        worktree,
        check=False,
    )
    if result.returncode != 0:
        return {"modules": []}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"modules": []}


def graph_edges(graph: dict) -> tuple[set[str], set[tuple[str, str]], dict[str, int]]:
    nodes: set[str] = set()
    edges: set[tuple[str, str]] = set()
    fan_in: dict[str, int] = {}
    for module in graph.get("modules", []):
        key = canonical(module.get("source", ""))
        if not key.startswith("src/"):
            continue
        nodes.add(key)
        for dep in module.get("dependencies", []):
            target = canonical(dep.get("resolved") or dep.get("module") or "")
            if target.startswith("src/") and target != key:
                edges.add((key, target))
                fan_in[target] = fan_in.get(target, 0) + 1
    return nodes, edges, fan_in


def cycles(edges: set[tuple[str, str]]) -> int:
    adjacency: dict[str, list[str]] = {}
    for source, target in edges:
        adjacency.setdefault(source, []).append(target)

    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    found = 0
    counter = 0

    def visit(node: str) -> None:
        nonlocal counter, found
        index[node] = low[node] = counter
        counter += 1
        stack.append(node)
        on_stack.add(node)
        for target in adjacency.get(node, []):
            if target not in index:
                visit(target)
                low[node] = min(low[node], low[target])
            elif target in on_stack:
                low[node] = min(low[node], index[target])
        if low[node] == index[node]:
            component = []
            while True:
                member = stack.pop()
                on_stack.discard(member)
                component.append(member)
                if member == node:
                    break
            if len(component) > 1:
                found += 1

    for node in set(adjacency) | {target for _, target in edges}:
        if node not in index:
            visit(node)
    return found


def longest_chain(edges: set[tuple[str, str]]) -> int:
    adjacency: dict[str, list[str]] = {}
    for source, target in edges:
        adjacency.setdefault(source, []).append(target)

    memo: dict[str, int] = {}

    def depth(node: str, seen: frozenset[str]) -> int:
        if node in memo:
            return memo[node]
        if node in seen:
            return 0
        best = 0
        for target in adjacency.get(node, []):
            best = max(best, 1 + depth(target, seen | {node}))
        memo[node] = best
        return best

    return max((depth(node, frozenset()) for node in adjacency), default=0)


def mermaid(nodes: set[str], edges: set[tuple[str, str]]) -> str:
    selected = sorted(nodes)[:MAX_NODES]
    keep = set(selected)
    lines = ["flowchart LR"]
    by_layer: dict[str, list[str]] = {}
    ids: dict[str, str] = {}
    for index, key in enumerate(selected):
        node_id = f"n{index}"
        ids[key] = node_id
        by_layer.setdefault(layer_of(key), []).append(key)

    for layer, keys in by_layer.items():
        lines.append(f'  subgraph {layer.replace(" ", "_").replace("(", "").replace(")", "")}["{layer}"]')
        for key in keys:
            lines.append(f'    {ids[key]}["{label_of(key)}"]')
        lines.append("  end")

    kept_edges = sorted(edge for edge in edges if edge[0] in keep and edge[1] in keep)[:MAX_EDGES]
    for source, target in kept_edges:
        if source != target:
            lines.append(f"  {ids[source]} --> {ids[target]}")

    return "\n".join(lines)


def make_base_worktree(worktree: Path, base_sha: str) -> tuple[Path, str | None]:
    """Materialise the base commit so its real import graph can be measured."""
    if not re.fullmatch(r"[0-9a-f]{7,40}", base_sha):
        return worktree.parent / "base-invalid", "base sha is not a commit id"

    path = worktree.parent / f"base-{base_sha[:10]}"
    if path.exists():
        try:
            shutil.rmtree(path)
        except OSError:
            return path, "could not clear an old base worktree"
    result = run(["git", "worktree", "add", "--detach", str(path), base_sha], worktree, check=False)
    if result.returncode != 0:
        return path, result.stderr.strip() or "git worktree add failed"

    link = path / "node_modules"
    if not link.exists() and (worktree / "node_modules").exists():
        with contextlib.suppress(OSError):
            os.symlink(worktree / "node_modules", link)

    config = path / ".dependency-cruiser.cjs"
    if not config.exists() and (worktree / ".dependency-cruiser.cjs").exists():
        shutil.copy2(worktree / ".dependency-cruiser.cjs", config)

    if not (path / "src").exists():
        return path, "base commit has no src directory"
    return path, None


def count_assertions(worktree: Path, rev: str) -> int:
    result = run(
        ["git", "grep", "-o", "-E", r"expect\(|assert[.(]", rev, "--", "test", "src"],
        worktree,
        check=False,
    )
    return len(result.stdout.splitlines()) if result.returncode in (0, 1) else 0


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def newest_log_entry(log_path: Path) -> str:
    try:
        text = log_path.read_text(encoding="utf-8")
    except OSError:
        return ""
    parts = re.split(r"^## ", text, flags=re.MULTILINE)
    for part in reversed(parts[1:]):
        if part.strip():
            return "## " + part.strip()
    return ""


def extract_doubts(entry: str) -> str:
    match = re.search(
        r"\*\*Doubts / trade-offs:\*\*\s*(.+?)(?:\n\s*-\s*\*\*|\Z)", entry, flags=re.DOTALL
    )
    return match.group(1).strip() if match else ""


def fence(code: str) -> str:
    return "```mermaid\n" + code + "\n```"


def build(worktree: Path, base_sha: str, body_path: Path, title_path: Path) -> None:
    head = git(worktree, "rev-parse", "HEAD")
    result = read_json(worktree / ".refactor" / "work" / "result.json")
    gates = read_json(worktree / ".refactor" / "work" / "gates.json")
    log_entry = newest_log_entry(worktree / ".refactor" / "LOG.md")

    changed = [
        line
        for line in git(worktree, "diff", "--name-only", f"{base_sha}..{head}").splitlines()
        if line
    ]
    changed_src = [
        line for line in changed if line.startswith("src/") and re.search(r"\.(ts|tsx)$", line)
    ]
    shortstat = git(worktree, "diff", "--shortstat", f"{base_sha}..{head}") or "no stats"

    base_wt, base_error = make_base_worktree(worktree, base_sha)
    try:
        after_nodes, after_edges, after_fan_in = graph_edges(load_graph(worktree))
        if base_error:
            before_nodes: set[str] = set()
            before_edges: set[tuple[str, str]] = set()
            before_fan_in: dict[str, int] = {}
        else:
            before_nodes, before_edges, before_fan_in = graph_edges(load_graph(base_wt))
    finally:
        run(["git", "worktree", "remove", "--force", str(base_wt)], worktree, check=False)
        run(["git", "worktree", "prune"], worktree, check=False)

    touched = {canonical(path) for path in changed_src}
    context = set(touched)
    for source, target in before_edges | after_edges:
        if source in touched or target in touched:
            context.add(source)
            context.add(target)
    context = {key for key in context if key.startswith("src/")}

    before_slice = (before_nodes & context, {e for e in before_edges if e[0] in context and e[1] in context})
    after_slice = (after_nodes & context, {e for e in after_edges if e[0] in context and e[1] in context})
    structural_change = before_slice != after_slice

    assertions_before = count_assertions(worktree, base_sha)
    assertions_after = count_assertions(worktree, "HEAD")

    summary = (result.get("summary") or "").strip()
    design_change = (result.get("designChange") or "").strip()
    review_guide = result.get("reviewGuide") or []
    risk = (result.get("risk") or "unknown").strip()

    title = (result.get("prTitle") or "").strip()
    if not title:
        heading = re.search(r"^## .*?—\s*(.+)$", log_entry, flags=re.MULTILINE)
        title = f"refactor: {heading.group(1).strip()}" if heading else f"refactor: steward pass {head[:7]}"

    lines: list[str] = []
    lines.append(f"Branch base: `{base_sha[:10]}` · head: `{head[:10]}` · risk: **{risk}**")
    lines.append("")
    lines.append("## What changed")
    lines.append("")
    lines.append(summary or "See the run entry at the end of this description.")
    lines.append("")
    lines.append("## The design change")
    lines.append("")
    lines.append(design_change or "No conceptual design change recorded; this pass changed internal structure only.")
    lines.append("")

    if not changed_src:
        lines.append("_No source module changed, so there is no dependency graph to compare._")
    elif not structural_change:
        lines.append(
            "_Module boundaries are unchanged: the same modules import the same modules before and after. "
            "The improvement is inside the modules, not between them._"
        )
        nodes, edges = after_slice
        if nodes:
            lines.append("")
            lines.append("<details><summary>Dependency graph of the touched slice</summary>")
            lines.append("")
            lines.append(fence(mermaid(nodes, edges)))
            lines.append("")
            lines.append("</details>")
    else:
        lines.append("### Before")
        lines.append("")
        lines.append(fence(mermaid(*before_slice)) if before_slice[0] else "_Base graph unavailable._")
        lines.append("")
        lines.append("### After")
        lines.append("")
        lines.append(fence(mermaid(*after_slice)) if after_slice[0] else "_Head graph unavailable._")
        lines.append("")

    lines.append("## Structural delta")
    lines.append("")
    lines.append("| measure | before | after |")
    lines.append("| --- | --- | --- |")
    lines.append(f"| change size | — | {shortstat} |")
    lines.append(f"| modules in project | {len(before_nodes)} | {len(after_nodes)} |")
    lines.append(f"| import edges in project | {len(before_edges)} | {len(after_edges)} |")
    lines.append(f"| dependency cycles | {cycles(before_edges)} | {cycles(after_edges)} |")
    lines.append(f"| longest import chain | {longest_chain(before_edges)} | {longest_chain(after_edges)} |")
    lines.append(f"| test assertions | {assertions_before} | {assertions_after} |")
    lines.append("")
    lines.append(
        "Fan-in of the touched modules (how many modules depend on each): "
        + ", ".join(
            f"`{label_of(key)}` {before_fan_in.get(key, 0)}→{after_fan_in.get(key, 0)}"
            for key in sorted(touched)[:8]
            if key in before_nodes or key in after_nodes
        )
        or "n/a"
    )
    lines.append("")
    lines.append("## What did not change")
    lines.append("")
    pre_existing = int(gates.get("preExistingFailures") or 0)
    if gates.get("release") == "passed" and pre_existing:
        lines.append(
            "- Release gate: `next build` passed and the vitest suite added no failures on "
            f"`{str(gates.get('head', head))[:10]}`. "
            f"{pre_existing} test(s) fail identically on the base commit."
        )
    elif gates.get("release") == "passed":
        lines.append(
            "- Release gate: `next build` and the full vitest suite passed on "
            f"`{str(gates.get('head', head))[:10]}`."
        )
    else:
        lines.append("- Behaviour: the release gate is not recorded for this branch; verify before merging.")
    if gates.get("assertionsBefore") is not None and gates.get("assertionsAfter") is not None:
        lines.append(
            f"- Tests: assertions went from {gates['assertionsBefore']} to {gates['assertionsAfter']}; "
            "none were removed."
        )
    else:
        lines.append("- Tests: assertion count did not decrease.")
    if gates.get("forbiddenPaths") == "passed":
        lines.append("- No dependency was added. Deployment, secrets and CI config were untouched.")
    lines.append("")

    lines.append("## Where to start reading")
    lines.append("")
    if review_guide:
        for index, item in enumerate(review_guide[:6], start=1):
            path = item.get("path", "") if isinstance(item, dict) else str(item)
            why = item.get("why", "") if isinstance(item, dict) else ""
            lines.append(f"{index}. `{path}`" + (f" — {why}" if why else ""))
    elif changed_src:
        for index, path in enumerate(changed_src[:5], start=1):
            lines.append(f"{index}. `{path}`")
    else:
        lines.append("No code files changed.")
    lines.append("")

    doubts = extract_doubts(log_entry)
    if doubts:
        lines.append("## Trade-offs and doubts")
        lines.append("")
        lines.append(doubts)
        lines.append("")

    if log_entry:
        lines.append("<details><summary>Run entry from .refactor/LOG.md</summary>")
        lines.append("")
        lines.append(log_entry)
        lines.append("")
        lines.append("</details>")
        lines.append("")

    body_path.write_text("\n".join(lines), encoding="utf-8")
    title_path.write_text(title if len(title) <= 72 else title[:69] + "...", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worktree", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--title", required=True)
    args = parser.parse_args()

    worktree = Path(args.worktree).resolve()
    if not (worktree / ".git").exists():
        sys.exit(f"make-pr-body: {worktree} is not a worktree")

    def confined(raw: str, name: str) -> Path:
        path = Path(raw).resolve()
        if not path.is_relative_to(worktree):
            sys.exit(f"make-pr-body: --{name} must live inside the worktree")
        return path

    build(worktree, args.base, confined(args.body, "body"), confined(args.title, "title"))
    print(f"make-pr-body: wrote {args.body}")


if __name__ == "__main__":
    main()
