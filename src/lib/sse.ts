export function encodeSseEvent(data: unknown): Uint8Array {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Bytes for an SSE comment line. Browsers ignore comments at the JS layer,
 * but the bytes flowing through the socket prevent iOS Safari (and some
 * mobile networks) from closing the connection during long LLM waits.
 */
export function encodeSseComment(text = "keep-alive"): Uint8Array {
  return new TextEncoder().encode(`: ${text}\n\n`);
}

/**
 * iOS Safari (and some intermediate proxies/CDNs) refuse to deliver fetch
 * stream chunks to JS until ~2 KB have been received. We push that much
 * padding up front as a single SSE comment to defeat the buffer.
 */
export function encodeSsePadding(bytes = 2048): Uint8Array {
  const filler = ":".concat(" ".repeat(Math.max(0, bytes - 4)), "\n\n");
  return new TextEncoder().encode(filler);
}

export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
