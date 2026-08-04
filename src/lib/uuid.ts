/**
 * crypto.randomUUID is only available in secure contexts (https or localhost).
 * Accessing the dev server via LAN IP triggers a "not implemented" error.
 * This wrapper falls back to a Math.random-based RFC4122 v4 generator when
 * the native API isn't available.
 */
export function uuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
