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
 * Helper wrapper around standard fetch that automatically prepends API_BASE_URL.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
    return fetch(getApiUrl(path), options);
}
