import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL;
  if (mode === 'production' && !/^https:\/\/[^/]+\/?$/.test(apiUrl || '')) {
    throw new Error('Set VITE_API_URL to your HTTPS Render URL in Netlify before building.');
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:4000',
        '/uploads': 'http://localhost:4000'
      }
    }
  };
});
