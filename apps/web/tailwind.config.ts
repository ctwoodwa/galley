import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'
import typography from '@tailwindcss/typography'

// Galley CSS tokens (mirrors :root in src/styles/App.css) so Tailwind utilities
// stay visually consistent with the existing plain-CSS editorial UI.
const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#0f1117',
          border: '#1e2130',
        },
        accent: {
          DEFAULT: '#5b8af5',
          dim: '#3a5cb8',
        },
        bg: '#14161e',
        surface: {
          DEFAULT: '#1a1d28',
          2: '#20243a',
        },
        text: {
          DEFAULT: '#e8eaf0',
          dim: '#8b92a8',
          muted: '#555d74',
        },
        ok: '#3dd68c',
        danger: '#f05252',
        warn: '#e8a040',
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [animate, typography],
}

export default config
