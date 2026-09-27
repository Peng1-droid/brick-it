import { defineConfig, loadEnv } from 'vite';
import { openRouterPlugin } from './server/openrouter';

// Relative base: the same build works on Netlify and on GitHub Pages (sub-path).
export default defineConfig(({ mode }) => ({
  plugins: [openRouterPlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)],
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
}));
