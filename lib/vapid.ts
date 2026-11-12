// The public half of the key pair used for phone notifications. It is meant to be public; the private half is only in the server settings (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY = "BKk6qAejx4mJpVhfRSb8l2DkVpVcP7gIA1n3qgxRa-lGwXPhl_DBHCYlhxssvBwtKsDk5Ixoz_3HQjwnG4f59cc";

export function keyToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
