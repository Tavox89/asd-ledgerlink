import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        card: 'hsl(var(--card))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        accent: 'hsl(var(--accent))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Segoe UI"', 'sans-serif'],
        mono: ['"SF Mono"', '"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 18px 60px -30px rgba(15, 23, 42, 0.35)',
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 40%), radial-gradient(circle at bottom right, rgba(16,185,129,0.08), transparent 30%)',
      },
    },
  },
  plugins: [],
};

export default config;
