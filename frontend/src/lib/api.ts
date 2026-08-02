import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'tocs.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** A 401 anywhere means the session is gone — drop the token and return to login. */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      tokenStore.clear();
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown, fallback = 'Terjadi kesalahan pada sistem'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; details?: Array<{ message: string }> };
    if (data?.details?.length) return data.details.map((d) => d.message).join(', ');
    if (data?.error) return data.error;
    if (error.code === 'ECONNABORTED') return 'Koneksi ke server timeout';
    if (!error.response) return 'Tidak dapat terhubung ke server';
  }
  return fallback;
}
