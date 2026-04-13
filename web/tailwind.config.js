/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Freesentation', 'sans-serif'],
      },
      colors: {
        surface: '#f1f0f6',
        card: '#ffffff',
        stroke: '#e5e4ef',
        primary: {
          DEFAULT: '#6c63ff',
          hover: '#574fd6',
          light: '#ededf8',
        },
        ink: {
          strong: '#1a1825',
          base: '#4b4860',
          muted: '#9693a8',
        },
      },
    },
  },
  plugins: [],
}
