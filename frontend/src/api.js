import axios from 'axios';

// In dev, Vite proxies /api to localhost:4000 (see vite.config.js), so this
// stays empty. In production, set VITE_API_URL to your deployed backend's
// full URL (e.g. https://your-app.onrender.com) at build time.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const api = axios.create({ baseURL: API_ORIGIN + '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
