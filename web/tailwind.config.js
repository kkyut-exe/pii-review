/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Freesentation', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
      },
      colors: {
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        stroke: 'rgb(var(--color-stroke) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
          'light-hover': 'rgb(var(--color-primary-light-hover) / <alpha-value>)',
        },
        ink: {
          strong: 'rgb(var(--color-ink-strong) / <alpha-value>)',
          base: 'rgb(var(--color-ink-base) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
        },
        status: {
          'pending-bg': 'rgb(var(--color-status-pending-bg) / <alpha-value>)',
          'pending-fg': 'rgb(var(--color-status-pending-fg) / <alpha-value>)',
          'reviewing-bg': 'rgb(var(--color-status-reviewing-bg) / <alpha-value>)',
          'reviewing-fg': 'rgb(var(--color-status-reviewing-fg) / <alpha-value>)',
          'reviewed-bg': 'rgb(var(--color-status-reviewed-bg) / <alpha-value>)',
          'reviewed-fg': 'rgb(var(--color-status-reviewed-fg) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
