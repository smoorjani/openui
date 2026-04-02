/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'canvas': {
          DEFAULT: 'var(--color-canvas)',
          dark: 'var(--color-canvas-dark)',
          light: 'var(--color-canvas-light)',
          lighter: 'var(--color-canvas-lighter)'
        },
        'surface': {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)'
        },
        'border': {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)'
        },
        'primary': 'var(--color-text-primary)',
        'secondary': 'var(--color-text-secondary)',
        'tertiary': 'var(--color-text-tertiary)',
        'muted': 'var(--color-text-muted)',
        'faint': 'var(--color-text-faint)',
        'accent': {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          contrast: 'var(--color-accent-contrast)',
        },
        'overlay': {
          5: 'var(--color-overlay-5)',
          10: 'var(--color-overlay-10)',
          20: 'var(--color-overlay-20)',
        },
        'elevated': {
          DEFAULT: 'var(--color-elevated)',
          half: 'var(--color-elevated-half)',
          hover: 'var(--color-elevated-hover)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },
      boxShadow: {
        'node': '0 2px 8px rgba(0, 0, 0, var(--shadow-opacity, 0.3))',
        'node-hover': '0 4px 16px rgba(0, 0, 0, var(--shadow-opacity, 0.4))',
        'glow': '0 0 20px var(--glow-color)',
      }
    },
  },
  plugins: [],
}
