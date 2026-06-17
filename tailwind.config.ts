import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { pitch: '#06141f', flood: '#80eaff', gold: '#f8d45c' } } }, plugins: [] } satisfies Config;
