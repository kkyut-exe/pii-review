/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Freesentation', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
      },
      colors: {
        surface: '#f1f0f6',
        card: '#ffffff',
        stroke: '#e5e4ef',
        primary: {
          DEFAULT: '#6c63ff',
          hover: '#574fd6',
          light: '#ededf8',
          'light-hover': '#dddaef',
        },
        ink: {
          strong: '#1a1825',
          base: '#4b4860',
          muted: '#9693a8',
        },
        status: {
          'pending-bg':   '#fff4e6',
          'pending-fg':   '#c17d11',
          'reviewing-bg': '#e8f0fe',
          'reviewing-fg': '#2956b2',
          'reviewed-bg':  '#e6f4ea',
          'reviewed-fg':  '#1e7e34',
        },
      },
    },
  },
  plugins: [],
}
