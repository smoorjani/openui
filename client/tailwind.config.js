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
          DEFAULT: '#1a1a1a',
          dark: '#141414',
          light: '#262626',
          lighter: '#333333'
        },
        'surface': {
          DEFAULT: '#262626',
          hover: '#2a2a2a',
          active: '#333333'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },
      boxShadow: {
        'node': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'node-hover': '0 4px 16px rgba(0, 0, 0, 0.4)',
        'glow': '0 0 20px var(--glow-color)',
      }
    },
  },
  plugins: [],
}
