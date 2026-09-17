"use client"

/**
 * Theme accessor for components.
 *
 * The app is dark-only, so `theme` is always `"dark"` and `toggleTheme` is a
 * no-op; the light values are present but commented out in `globals.css`.
 * No component consumes this hook yet.
 */

function useTheme() {
  return { theme: "dark" as const, toggleTheme: () => {} }
}

export { useTheme }
