import React, { createContext, useContext, useState, useMemo } from 'react'
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper'

interface ThemeContextValue {
  isDark: boolean
  toggle: () => void
  theme: MD3Theme
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggle: () => {},
  theme: MD3LightTheme,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  const value = useMemo<ThemeContextValue>(() => ({
    isDark,
    toggle: () => setIsDark(prev => !prev),
    theme: isDark ? MD3DarkTheme : MD3LightTheme,
  }), [isDark])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
