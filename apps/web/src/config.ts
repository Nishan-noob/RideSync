const fallbackOrigin =
	typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || fallbackOrigin).trim()
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || fallbackOrigin).trim()
