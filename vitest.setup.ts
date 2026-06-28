import { vi } from 'vitest'

const storageMap = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value) },
  removeItem: (key: string) => { storageMap.delete(key) },
  clear: () => storageMap.clear(),
  get length() { return storageMap.size },
  key: (index: number) => [...storageMap.keys()][index] ?? null,
})
