'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/** Dark/light mode provider — class-based so Tailwind's `.dark` variant works. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
