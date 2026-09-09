import type { Config } from 'tailwindcss'

/* As cores vivem em app/globals.css (:root). Aqui so damos nome a elas. */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        panel: 'var(--panel)',
        line: 'var(--line)',
        muted: 'var(--muted)',
        brand: 'var(--brand)',
        good: 'var(--good)',
        bad: 'var(--bad)',
        warn: 'var(--warn)',
      },
    },
  },
  plugins: [],
} satisfies Config
