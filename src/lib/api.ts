import axios, { AxiosError } from 'axios';
import { supabase, EDGE_FUNCTION_URL } from './supabase';
import { toast } from 'sonner';
import type {
  AnalysisResult,
  HealthStatus,
  RetrainLog,
} from './types';

const api = axios.create({
  baseURL: EDGE_FUNCTION_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach auth token to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Centralized error handling with toast notifications
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred.';

    if (status === 401) {
      toast.error('Your session has expired. Please sign in again.');
    } else if (status === 403) {
      toast.error('You do not have permission to perform this action.');
    } else if (status && status >= 500) {
      toast.error('Server error. Please try again in a moment.');
    } else if (error.code === 'ECONNABORTED') {
      toast.error('The request timed out. Please try again.');
    } else if (!error.response) {
      toast.error('Network error. Check your connection and try again.');
    } else {
      toast.error(message);
    }
    return Promise.reject(error);
  },
);

async function getSessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export const phishingApi = {
  async predictUrl(url: string): Promise<AnalysisResult> {
    const token = await getSessionToken();
    const { data } = await api.post<AnalysisResult>('/predict-url', { url }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return data;
  },

  async health(): Promise<HealthStatus> {
    const { data } = await api.get<HealthStatus>('/health');
    return data;
  },
};

export { api };
export default api;