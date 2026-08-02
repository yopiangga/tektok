/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light-mode translation of the TOCS style guide.
        ink: {
          DEFAULT: '#0F172A', // Primary
          soft: '#334155',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        canvas: {
          DEFAULT: '#F1F5F9', // page background
          sunken: '#E8EDF3',
          raised: '#FFFFFF', // cards
        },
        line: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        accent: {
          DEFAULT: '#2563EB',
          soft: '#EFF6FF',
          strong: '#1D4ED8',
        },
        success: { DEFAULT: '#10B981', soft: '#ECFDF5', strong: '#047857' },
        warning: { DEFAULT: '#F59E0B', soft: '#FFFBEB', strong: '#B45309' },
        danger: { DEFAULT: '#EF4444', soft: '#FEF2F2', strong: '#B91C1C' },

        // Immersive surface for the personnel app only. A field phone is held
        // one-handed over full-bleed camera content, where a light chrome would
        // both wash out the video and burn battery on OLED; the command centre
        // stays light per the style guide.
        night: {
          DEFAULT: '#000000',
          soft: '#121212',
          raised: '#1F1F1F',
          line: '#2E2E2E',
        },
        live: '#FE2C55', // record/live accent — reads instantly as "broadcasting"
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)',
        lift: '0 2px 4px rgba(15, 23, 42, 0.05), 0 12px 28px rgba(15, 23, 42, 0.10)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 220ms ease-out',
      },
    },
  },
  plugins: [],
};
