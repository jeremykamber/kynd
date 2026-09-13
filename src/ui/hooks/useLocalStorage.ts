'use client'

/**
 * `useState`-shaped state mirrored into `window.localStorage` under `key`.
 *
 * The first render always returns `initialValue` so server and client markup
 * agree; after mount the stored JSON is read and, when `key` is absent from
 * storage, the value resets to `initialValue`. Because the value is not
 * available before mount, treat the returned value as pre-hydration
 * `initialValue` and never branch on it during SSR.
 *
 * `T` must be JSON-serializable; a failed read or write logs a warning and
 * leaves the in-memory value unchanged rather than throwing.
 */

import { useState, useEffect, Dispatch, SetStateAction } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  // Pass initialValue to useState so that the first render (SSR/Hydration) 
  // matches what the server would produce.
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        setStoredValue(JSON.parse(item))
      } else {
        setStoredValue(initialValue)
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
    }
    setIsInitialized(true)
  }, [key])

  useEffect(() => {
    if (!isInitialized) return

    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue))
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue, isInitialized])

  return [storedValue, setStoredValue]
}
