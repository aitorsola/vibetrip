export interface PostSseOptions<T> {
  url: string;
  body: unknown;
  signal?: AbortSignal;
  onEvent: (event: T) => void;
}

export async function postSseStream<T>({
  url,
  body,
  signal,
  onEvent,
}: PostSseOptions<T>): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed: ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string; message?: string };
      if (json.message) message = json.message;
      else if (json.error) message = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.replace(/^data:\s?/, "");
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as T);
      } catch {
        /* ignore malformed event */
      }
    }
  }
}
