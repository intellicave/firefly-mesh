// SSE EventSource helper — subscribes to a firefly-mesh stream channel
// (inbox.{employeeId} / org.graph.{orgId} / audit.org.{orgId} / etc).
//
// The web/api/stream/{channel}/route.ts route keeps the connection alive
// + emits `event: <type>\ndata: <json>\n\n` frames (per design §6.6).
//
// Usage:
//   const sub = subscribeSSE({ baseUrl, token, channel: 'inbox.${empId}' });
//   sub.on('a2a.message.created', (e) => { ... });
//   sub.close();

export interface SSEOpts {
  baseUrl: string;
  token: string;
  /** Channel name, e.g. `inbox.${employeeId}` — server will namespace this. */
  channel: string;
  /** Optional EventSource impl override (browser uses native; Node needs polyfill). */
  EventSourceImpl?: typeof EventSource;
}

export interface SSESubscription {
  on(event: string, handler: (data: unknown) => void): void;
  close(): void;
}

export function subscribeSSE(opts: SSEOpts): SSESubscription {
  const ESImpl = opts.EventSourceImpl ?? (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
  if (!ESImpl) {
    throw new Error(
      "EventSource not available — pass EventSourceImpl from 'eventsource' npm package on Node.",
    );
  }
  const url =
    opts.baseUrl.replace(/\/+$/, "") +
    `/api/stream/${encodeURIComponent(opts.channel)}?token=${encodeURIComponent(opts.token)}`;
  const es = new ESImpl(url);

  const handlers = new Map<string, Array<(data: unknown) => void>>();

  es.onmessage = (ev: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      parsed = ev.data;
    }
    for (const h of handlers.get("message") ?? []) h(parsed);
  };

  return {
    on(event, handler) {
      if (!handlers.has(event)) {
        handlers.set(event, []);
        es.addEventListener(event, ((ev: MessageEvent) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(ev.data);
          } catch {
            parsed = ev.data;
          }
          for (const h of handlers.get(event) ?? []) h(parsed);
        }) as EventListener);
      }
      handlers.get(event)!.push(handler);
    },
    close() {
      es.close();
      handlers.clear();
    },
  };
}
