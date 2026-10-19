import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    },
    extend: {
      colors: {
        navy: {
          950: '#070a11',
          900: '#0c1322',
          850: '#0f172a',
          800: '#131f37',
          700: '#1e293b',
        },
        cyan: {
          primary: '#00e5ff',
          glow: 'rgba(0, 229, 255, 0.35)',
        },
        emerald: {
          brand: '#00e676',
          glow: 'rgba(0, 230, 118, 0.35)',
        },
        amber: {
          warning: '#ffab00',
        },
        rose: {
          critical: '#ff3b30',
        },
        purple: {
          accent: '#7c4dff',
        },
        surface: {
          card: 'rgba(19, 31, 55, 0.75)',
          overlay: 'rgba(7, 10, 17, 0.85)',
          hover: 'rgba(30, 41, 59, 0.65)',
        },
        border: {
          subtle: 'rgba(0, 229, 255, 0.15)',
          glow: 'rgba(0, 229, 255, 0.45)',
          critical: 'rgba(255, 59, 48, 0.35)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 229, 255, 0.25)',
        'glow-emerald': '0 0 20px rgba(0, 230, 118, 0.25)',
        'glow-critical': '0 0 20px rgba(255, 59, 48, 0.25)',
      },
      animation: {
        pulseFast: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
