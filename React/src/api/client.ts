const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface ApiError {
  code: string;
  message: string;
  sqlstate?: string | null;
  details?: string | null;
  hint?: string | null;
}

interface ApiResponse<T> {
  status: 'ok';
  data: T;
  meta?: unknown;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: ApiError = payload.error ?? {
      code: 'unknown_error',
      message: 'Request failed',
    };
    throw error;
  }

  return payload as ApiResponse<T>;
}
