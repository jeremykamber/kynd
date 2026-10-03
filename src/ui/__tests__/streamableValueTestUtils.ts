import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { StreamableValue } from "@ai-sdk/rsc";

/** The slice of `@ai-sdk/rsc`'s server build the tests need. */
interface StreamableValueServerModule {
  createStreamableValue<T = unknown>(initialValue?: T): {
    value: StreamableValue<T>;
    update(value: T): unknown;
    done(value?: T): unknown;
    error(error: unknown): unknown;
  };
}

// `createStreamableValue` is exported only under the package's `react-server`
// condition; vitest resolves the client condition, where it does not exist.
// Importing the server build by absolute path lets tests build a genuine
// StreamableValue payload — the same object Next serialises to the client —
// so consumption is exercised through the real `readStreamableValue`.
const require = createRequire(import.meta.url);
const rscPackageDir = dirname(require.resolve("@ai-sdk/rsc/package.json"));
const rscServerEntry = pathToFileURL(join(rscPackageDir, "dist/rsc-server.mjs")).href;

/**
 * Real `createStreamableValue` for tests. Capture `.value` *before* calling
 * `update`/`done`, exactly as a server action does when it returns the stream —
 * otherwise the snapshot only contains the final value.
 */
export const createStreamableValue = (
  (await import(/* @vite-ignore */ rscServerEntry)) as StreamableValueServerModule
).createStreamableValue;
