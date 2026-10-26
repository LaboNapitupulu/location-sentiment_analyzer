/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        google: {
          blue: '#1a73e8',
          red: '#d93025',
          yellow: '#f9ab00',
          green: '#1e8e3e',
          light: '#F8F9FA',
          darkBg: '#202124',
          darkSurface: '#303134',
          darkBorder: '#5f6368',
          darkText: '#e8eaed'
        },
        sentiment: {
          pos: {
            DEFAULT: '#16a34a',
            light: '#f0fdf4',
            dark: '#14532d',
            border: '#bbf7d0',
          },
          neg: {
            DEFAULT: '#dc2626',
            light: '#fef2f2',
            dark: '#7f1d1d',
            border: '#fecaca',
          },
          neu: {
            DEFAULT: '#d97706',
            light: '#fffbeb',
            dark: '#78350f',
            border: '#fde68a',
          }
        }
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'elevated': '0 10px 30px -5px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04)',
        'elevated-dark': '0 10px 30px -5px rgba(0, 0, 0, 0.4), 0 4px 12px -2px rgba(0, 0, 0, 0.25)',
      }
    },
  },
  plugins: [],
}
