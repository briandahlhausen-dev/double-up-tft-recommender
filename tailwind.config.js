/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Exo 2"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // AD = warm amber/orange, AP = cyan. Used everywhere the AD/AP split matters.
        ad: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          dark: '#b45309',
        },
        ap: {
          DEFAULT: '#22d3ee',
          light: '#67e8f9',
          dark: '#0891b2',
        },
        // Deep cosmic backgrounds for the Space Gods theme.
        cosmos: {
          950: '#05050f',
          900: '#09091c',
          850: '#0e0e26',
          800: '#141433',
          700: '#1d1d4d',
          600: '#2a2a66',
        },
        nebula: '#8b5cf6',
      },
      boxShadow: {
        'glow-ad': '0 0 28px rgba(245, 158, 11, 0.25)',
        'glow-ap': '0 0 28px rgba(34, 211, 238, 0.25)',
        'glow-violet': '0 0 32px rgba(139, 92, 246, 0.28)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '0.9' },
        },
        'ring-fill': {
          '0%': { strokeDashoffset: 'var(--circ)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
      },
    },
  },
  plugins: [],
};
