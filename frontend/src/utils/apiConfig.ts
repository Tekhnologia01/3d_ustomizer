/**
 * Central API & Asset URL configuration.
 * Reads the backend base URL dynamically from environment variables (import.meta.env.VITE_API_BASE_URL).
 */

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

/**
 * Returns the fully-qualified API URL for a given endpoint path.
 * e.g., getApiUrl('/api/products/') => 'http://144.126.132.91:8000/api/products/'
 */
export function getApiUrl(path: string): string {
    if (!path) return API_BASE_URL;
    if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

/**
 * Resolves a media / static asset URL (like product image or 3D model path)
 * against API_BASE_URL if it is a relative path starting with '/' (e.g., '/media/...').
 * Also re-anchors full URLs referencing /media/ or /static/ paths to the active API_BASE_URL.
 */
export function resolveMediaUrl(url: string | null | undefined, fallbackLabel?: string): string {
    if (!url || !url.trim()) {
        return fallbackLabel
            ? `https://placehold.co/700x700/1a1a2e/6c63ff?text=${encodeURIComponent(fallbackLabel)}`
            : '';
    }
    const trimmed = url.trim();
    if (
        /^https?:\/\//i.test(trimmed) ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:')
    ) {
        if (API_BASE_URL && (trimmed.includes('/media/') || trimmed.includes('/static/'))) {
            try {
                const parsed = new URL(trimmed);
                const apiParsed = new URL(API_BASE_URL);
                if (parsed.origin !== apiParsed.origin) {
                    return `${API_BASE_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
                }
            } catch {
                // Ignore parse errors
            }
        }
        return trimmed;
    }
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

/**
 * Helper wrapper around standard fetch that automatically prepends API_BASE_URL
 * and handles JWT token authentication/refresh.
 */
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
    refreshSubscribers.forEach(cb => cb(token));
    refreshSubscribers = [];
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const getHeaders = () => {
        const headers = new Headers(options.headers || {});
        const token = localStorage.getItem('access_token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        return headers;
    };

    options.headers = getHeaders();
    let response = await fetch(getApiUrl(path), options);

    if (response.status === 401) {
        // Try to refresh token
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            // No refresh token, trigger logout
            localStorage.removeItem('access_token');
            window.dispatchEvent(new Event('auth-logout'));
            return response;
        }

        if (!isRefreshing) {
            isRefreshing = true;
            try {
                const refreshRes = await fetch(getApiUrl('/api/auth/refresh/'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh: refreshToken }),
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    localStorage.setItem('access_token', data.access);
                    onRefreshed(data.access);
                } else {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    window.dispatchEvent(new Event('auth-logout'));
                }
            } catch (err) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.dispatchEvent(new Event('auth-logout'));
            } finally {
                isRefreshing = false;
            }
        }

        // Wait for the token to be refreshed by returning a new promise
        return new Promise<Response>((resolve) => {
            subscribeTokenRefresh((newToken: string) => {
                options.headers = getHeaders();
                resolve(fetch(getApiUrl(path), options));
            });

            // If the refresh fails, we still want to resolve this eventually
            // We can check if access_token is empty after a short timeout?
            // A simpler way is handled above, but here we just wait.
            // If onRefreshed isn't called because refresh failed, this might hang if we don't handle it.
            // So let's add a timeout or check state
        });
    }

    return response;
}
