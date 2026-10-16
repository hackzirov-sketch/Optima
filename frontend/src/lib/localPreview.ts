export function isLocalPreviewEnvironment(development: boolean, hostname: string, enabled = false): boolean {
  return development && enabled && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function isLocalPreview(): boolean {
  return isLocalPreviewEnvironment(import.meta.env.DEV, typeof window === "undefined" ? "" : window.location.hostname, import.meta.env.VITE_LOCAL_PREVIEW === "true");
}
