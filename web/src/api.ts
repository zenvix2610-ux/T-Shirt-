import { money } from "./money";

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

export { money };

export function assetUrl(path: string): string {
  if (!path || /^https?:\/\//i.test(path)) return path;
  const origin = new URL(API_BASE, window.location.origin).origin;
  return new URL(path, origin).toString();
}

export function getToken(): string {
  return localStorage.getItem("td_access_token") || "";
}

export function setSession(accessToken: string, refreshToken: string) {
  localStorage.setItem("td_access_token", accessToken);
  localStorage.setItem("td_refresh_token", refreshToken);
}

export function clearSession() {
  localStorage.removeItem("td_access_token");
  localStorage.removeItem("td_refresh_token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : "Something went wrong. Please try again.";
    throw new Error(detail);
  }
  return body as T;
}
