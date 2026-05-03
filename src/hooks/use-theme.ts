"use client"

import * as React from "react"

type Theme = "light" | "dark"

function useTheme() {
  const [theme, setTheme] = React.useState<Theme>("dark")

  React.useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null
    if (stored) {
      setTheme(stored)
    }
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = React.useCallback(() => {
    setTheme(prev => prev === "dark" ? "light" : "dark")
  }, [])

  return { theme, toggleTheme }
}

export { useTheme }
