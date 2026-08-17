/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        quantum: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      boxShadow: {
        soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        bubble: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        glow: '0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 32px -8px rgba(0, 0, 0, 0.2)',
        'glow-lg': '0 0 0 1px rgba(0, 0, 0, 0.1), 0 16px 48px -12px rgba(0, 0, 0, 0.25)',
        'input-focus': '0 0 0 3px rgba(0, 0, 0, 0.1), 0 12px 40px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s infinite ease-in-out both',
        'float': 'float 5s ease-in-out infinite',
        'shimmer': 'shimmer 2.2s linear infinite',
        'orbit': 'orbit 8s linear infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 80%, 100%': { transform: 'scale(0.55)', opacity: '0.35' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
