#!/usr/bin/env bun
/**
 * Import-graph depth and cycle report.
 *
 * Reads dependency-cruiser JSON from a file (or stdin) and prints the longest
 * dependency chain, the modules with the most dependents, and any cycles. The
 * point is to expose the shapes that make a codebase hard to change: a change
 * low in a deep chain ripples upward, and a cycle means two modules must always
 * be understood together.
 *
 * Usage: bun scripts/refactor/depth.ts graph.json [--top 10]
 */

import { readFileSync } from "node:fs"

type Dependency = { resolved?: string; module?: string; circular?: boolean }
type Module = { source: string; dependencies?: Dependency[] }
type Graph = { modules?: Module[] }

export {}

function readStdin(): string {
  return readFileSync(0, "utf8")
}

function main(): void {
  const args = process.argv.slice(2)
  const file = args.find((arg) => !arg.startsWith("--"))
  const topIndex = args.indexOf("--top")
  const topN = topIndex >= 0 ? Number(args[topIndex + 1]) || 10 : 10

  if (!file && process.stdin.isTTY) {
    console.error("usage: bun scripts/refactor/depth.ts <graph.json> [--top 10]")
    process.exit(2)
  }

  const raw = file ? readFileSync(file, "utf8") : readStdin()

  let graph: Graph
  try {
    graph = JSON.parse(raw) as Graph
  } catch (error) {
    console.error(`depth: cannot parse dependency graph: ${(error as Error).message}`)
    process.exit(2)
  }

  const modules = graph.modules ?? []

  // dependency-cruiser runs without a project config here, so TS path aliases
  // (`@/...`) and real paths (`src/...ts`) describe the same file. Collapse both
  // to one key: the `src/` path without an extension.
  function canonical(path: string): string {
    const aliased = path.startsWith("@/") ? `src/${path.slice(2)}` : path
    return aliased.replace(/\.(d\.ts|tsx?|jsx?|mjs|cjs)$/, "")
  }

  const display = new Map<string, string>()
  const edges = new Map<string, Set<string>>()
  const fanIn = new Map<string, number>()

  for (const mod of modules) {
    const key = canonical(mod.source)
    if (!key.startsWith("src/")) continue
    if (!edges.has(key)) edges.set(key, new Set())
    // Prefer the concrete file path for display over an alias-only node.
    if (!display.has(key) || mod.source.startsWith("src/")) {
      display.set(key, mod.source.startsWith("src/") ? mod.source : key)
    }
  }

  for (const mod of modules) {
    const key = canonical(mod.source)
    if (!key.startsWith("src/")) continue
    for (const dep of mod.dependencies ?? []) {
      const target = canonical(dep.resolved ?? dep.module ?? "")
      if (!target.startsWith("src/") || target === key) continue
      edges.get(key)!.add(target)
    }
  }

  for (const [source, targets] of edges) {
    for (const target of targets) {
      fanIn.set(target, (fanIn.get(target) ?? 0) + 1)
    }
    void source
  }

  // Longest chain from each module, memoized. Cycles are cut at the repeated
  // node, so this terminates even on a broken graph.
  const depth = new Map<string, number>()
  const via = new Map<string, string>()

  function longestFrom(source: string, stack: Set<string>): number {
    const cached = depth.get(source)
    if (cached !== undefined) return cached
    if (stack.has(source)) return 0
    stack.add(source)
    let best = 0
    let bestNext = ""
      for (const dep of edges.get(source) ?? []) {
      const candidate = 1 + longestFrom(dep, stack)
      if (candidate > best) {
        best = candidate
        bestNext = dep
      }
    }
    stack.delete(source)
    depth.set(source, best)
    via.set(source, bestNext)
    return best
  }

  for (const source of edges.keys()) longestFrom(source, new Set())

  const lines: string[] = []
  const edgeCount = [...edges.values()].reduce((total, deps) => total + deps.size, 0)
  lines.push(`modules: ${edges.size}   edges: ${edgeCount}`)

  const label = (key: string): string => display.get(key) ?? key

  const roots = [...depth.entries()].filter(([source]) => (fanIn.get(source) ?? 0) === 0)
  const ranked = (roots.length > 0 ? roots : [...depth.entries()]).sort((a, b) => b[1] - a[1])
  const deepest = ranked[0]

  if (deepest) {
    const [deepestSource, deepestLength] = deepest
    const chain = [deepestSource]
    const seen = new Set(chain)
    let cursor = deepestSource
    while (via.get(cursor) && !seen.has(via.get(cursor)!) && chain.length < 64) {
      cursor = via.get(cursor)!
      seen.add(cursor)
      chain.push(cursor)
    }
    lines.push(`longest chain: ${deepestLength} hops from ${label(deepestSource)}`)
    for (const node of chain) lines.push(`  ${label(node)}`)
  }

  // Tarjan strongly connected components; a component larger than one module is
  // a cycle.
  const indexByNode = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []
  let counter = 0

  function strongConnect(node: string): void {
    indexByNode.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)

    for (const dep of edges.get(node) ?? []) {
      if (!edges.has(dep)) continue
      if (!indexByNode.has(dep)) {
        strongConnect(dep)
        low.set(node, Math.min(low.get(node)!, low.get(dep)!))
      } else if (onStack.has(dep)) {
        low.set(node, Math.min(low.get(node)!, indexByNode.get(dep)!))
      }
    }

    if (low.get(node) === indexByNode.get(node)) {
      const component: string[] = []
      let member = ""
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node && stack.length > 0)
      if (component.length > 1) cycles.push(component.reverse())
    }
  }

  for (const node of edges.keys()) if (!indexByNode.has(node)) strongConnect(node)

  lines.push(`cycles: ${cycles.length}`)
  for (const cycle of cycles.slice(0, topN)) lines.push(`  ${cycle.map(label).join(" -> ")} -> ${label(cycle[0])}`)

  const busiest = [...fanIn.entries()]
    .filter(([source]) => source.startsWith("src/"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
  lines.push("top dependents (fan-in):")
  for (const [source, count] of busiest) lines.push(`  ${count.toString().padStart(4)}  ${label(source)}`)

  const widest = [...edges.entries()]
    .filter(([source]) => source.startsWith("src/"))
    .map(([source, deps]) => [source, deps.size] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
  lines.push("top fan-out (imports):")
  for (const [source, count] of widest) lines.push(`  ${count.toString().padStart(4)}  ${label(source)}`)

  console.log(lines.join("\n"))
}

main()
