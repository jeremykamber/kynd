/**
 * dependency-cruiser configuration for the automated refactor steward.
 *
 * The `tsConfig` reference is what makes the `@/*` alias resolve. Without it,
 * dependency-cruiser treats every `@/...` import as an external module, so the
 * import graph and the depth report are largely empty.
 *
 * The rules below restate the layer table in ARCHITECTURE.md. They are `warn`,
 * not `error`: some edges are known violations today, and the refactor steward
 * needs to see them, not be blocked by them. Run:
 *
 *   ./node_modules/.bin/depcruise src
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-stays-pure",
      comment:
        "domain is pure TypeScript: no framework, no outer layer, no SDK.",
      severity: "warn",
      from: { path: "^src/domain" },
      to: {
        path: "^src/(app|actions|ui|components|hooks|infrastructure|lib)/",
      },
    },
    {
      name: "domain-no-frameworks",
      comment: "domain must not import React or Next.",
      severity: "warn",
      from: { path: "^src/domain" },
      to: { path: "^node_modules/(react|next|@radix-ui|zustand)" },
    },
    {
      name: "application-does-not-know-infrastructure",
      comment:
        "application orchestrates ports; adapters belong to infrastructure.",
      severity: "warn",
      from: { path: "^src/application" },
      to: { path: "^src/infrastructure/" },
    },
    {
      name: "application-is-not-ui",
      comment: "application must not import React, Next, or UI code.",
      severity: "warn",
      from: { path: "^src/application" },
      to: { path: ["^src/(app|ui|components|hooks)/", "^node_modules/(react|next)"] },
    },
    {
      name: "infrastructure-is-not-ui",
      comment: "adapters implement ports; they must not depend on the UI.",
      severity: "warn",
      from: { path: "^src/infrastructure" },
      to: { path: ["^src/(app|ui|components|hooks)/", "^node_modules/(react|next)/"] },
    },
    {
      name: "no-circular",
      comment:
        "A cycle means two modules must always be understood together.",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(node_modules|\\.next|\\.netlify|\\.worktrees|coverage)/",
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    reporterOptions: { text: { highlightFocused: true } },
  },
};
