"use client"

import { useEffect, useState } from "react"

export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    try {
      setDark(localStorage.getItem("inventoryDarkMode") === "true")
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem("inventoryDarkMode", String(dark))
    } catch {}
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return [dark, () => setDark((d) => !d)]
}
