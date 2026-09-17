/**
 * Namespaced in-memory map whose entries expire on their own: a key is dropped
 * CLEANUP_MS after its last write. An instance is a view onto one globalThis-
 * backed map, so the fire-and-forget task that writes entries and the request
 * that later reads them keep sharing the same data across Next.js HMR reloads,
 * which otherwise reset module-level state.
 *
 * Process-local only — nothing is shared between server instances, and there is
 * no persistence. Callers must pass key strings that are unique across every
 * ExpiringStore in the process; all instances share one global key registry.
 */

const CLEANUP_MS = 30 * 60 * 1000; // 30 minutes

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const globalMaps: Record<string, Map<unknown, unknown>> = (globalThis as Record<string, unknown>).__kynd_global_maps as Record<string, Map<unknown, unknown>>
  ?? ((globalThis as Record<string, unknown>).__kynd_global_maps = {} as Record<string, Map<unknown, unknown>>);

function getGlobalMap<K, V>(key: string): Map<K, V> {
  if (!globalMaps[key]) globalMaps[key] = new Map();
  return globalMaps[key] as Map<K, V>;
}

export class ExpiringStore<V> {
  private data: Map<string, V>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;

  constructor(
    private readonly dataKey: string,
    private readonly timerKey: string,
  ) {
    this.data = getGlobalMap<string, V>(dataKey);
    this.timers = getGlobalMap<string, ReturnType<typeof setTimeout>>(timerKey);
  }

  get(key: string): V | undefined {
    return this.data.get(key);
  }

  set(key: string, value: V): void {
    this.data.set(key, value);
    this.scheduleCleanup(key);
  }

  delete(key: string): void {
    this.data.delete(key);
    const timer = this.timers.get(key);
    clearTimeout(timer);
    this.timers.delete(key);
  }

  private scheduleCleanup(key: string): void {
    const existing = this.timers.get(key);
    clearTimeout(existing);
    this.timers.set(key, setTimeout(() => this.delete(key), CLEANUP_MS));
  }
}
