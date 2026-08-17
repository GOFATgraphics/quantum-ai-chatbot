/** @type {import('tailwindcss').Config} */

// Brutalist / Shadowplay — pure grayscale, no hue anywhere. Anchored on the
// 4-swatch brand palette at conventional Tailwind stops (200/400/700/900),
// interpolated for the rest so the app's existing shade usage (400/500/600
// etc.) still reads as a coherent scale instead of 4 flat bands.
//   #D1D1D1 -> 200   (light-mode surface/border)
//   #8C8C8C -> 400   (light-mode muted text, dark-mode secondary)
//   #4A4A4A -> 700   (dark-mode border/surface)
//   #212121 -> 900   (dark-mode background)
const grayscale = {
  50:  '#fafafa',
  100: '#e8e8e8',
  200: '#d1d1d1',
  300: '#afafaf',
  400: '#8c8c8c',
  500: '#737373',
  600: '#595959',
  700: '#4a4a4a',
  800: '#333333',
  900: '#212121',
  950: '#131313',
}

// Every hue the app uses (accents, errors, success, warnings) collapses onto
// this same ramp — strict monochrome means a "rose-500" error and an
// "emerald-500" success render as the identical gray, differentiated only
// by icon/weight/position, never by color.
const monoFamilies = ['indigo', 'violet', 'sky', 'rose', 'emerald', 'amber', 'orange', 'slate', 'quantum']
const colors = Object.fromEntries(monoFamilies.map((name) => [name, grayscale]))

// Hard, zero-blur offset shadows instead of soft blurred ones — the
// signature brutalist "sticker" shadow, not a glass drop-shadow.
const hardShadow = (px) => `${px}px ${px}px 0 0 rgba(0,0,0,0.9)`

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
      colors,
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px', // legitimate circles (avatars, status dots) stay round
      },
      boxShadow: {
        sm: hardShadow(2),
        DEFAULT: hardShadow(3),
        md: hardShadow(3),
        lg: hardShadow(4),
        xl: hardShadow(5),
        '2xl': hardShadow(6),
        inner: 'inset 0 0 0 1px rgba(0,0,0,0.9)',
        none: 'none',
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s infinite ease-in-out both',
        'float': 'float 5s ease-in-out infinite',
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
      },
    },
  },
  plugins: [],
}
