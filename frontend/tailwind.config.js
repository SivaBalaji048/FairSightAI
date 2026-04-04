/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fl: {
          bg:       '#05080f',
          surface:  '#0f1424',
          panel:    '#0a0e1a',
          cyan:     '#00e5ff',
          'cyan-dim': '#00b8cc',
          violet:   '#8b5cf6',
          emerald:  '#10b981',
          amber:    '#f59e0b',
          red:      '#ef4444',
          border:   'rgba(255,255,255,0.07)',
          text:     '#f0f4ff',
          muted:    '#7a86a1',
          ghost:    '#3d4a66',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
      },
      animation: {
        'float-slow': 'float 8s ease-in-out infinite',
        'float-med':  'float 6s ease-in-out infinite 2s',
        'float-fast': 'float 4s ease-in-out infinite 1s',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'grain':      'grain 0.5s steps(1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-20px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%':       { opacity: '0.7', transform: 'scale(1.05)' },
        },
        grain: {
          '0%':   { transform: 'translate(0, 0)' },
          '10%':  { transform: 'translate(-5%, -5%)' },
          '20%':  { transform: 'translate(-10%, 5%)' },
          '30%':  { transform: 'translate(5%, -10%)' },
          '40%':  { transform: 'translate(-5%, 15%)' },
          '50%':  { transform: 'translate(-10%, 5%)' },
          '60%':  { transform: 'translate(15%, 0)' },
          '70%':  { transform: 'translate(0, 10%)' },
          '80%':  { transform: 'translate(-15%, 0)' },
          '90%':  { transform: 'translate(10%, 5%)' },
          '100%': { transform: 'translate(5%, 0)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'cyber-grid': 'linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-60': '60px 60px',
      },
    },
  },
  plugins: [],
}
