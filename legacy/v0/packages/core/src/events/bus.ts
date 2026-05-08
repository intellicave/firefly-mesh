// In-memory SSE event bus (M1-5, MVP).
// V2 will swap implementation to Redis Streams for horizontal scaling;
// the publish/subscribe API stays stable.

type Handler = (data: string) => void;

export interface EventEnvelope {
  event: string; // <domain>.<action>
  ts: string; // ISO 8601 UTC
  payload: unknown;
}

class InMemoryBus {
  private channels = new Map<string, Set<Handler>>();

  /**
   * Publish to a topic. Handler payload is a JSON string (SSE-ready).
   */
  publish(topic: string, eventName: string, payload: unknown): void {
    const envelope: EventEnvelope = {
      event: eventName,
      ts: new Date().toISOString(),
      payload,
    };
    const data = JSON.stringify(envelope);
    const handlers = this.channels.get(topic);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(data);
      } catch {
        // handler errors don't crash other subscribers
      }
    }
  }

  /**
   * Subscribe to topic. Returns unsubscribe function.
   */
  subscribe(topic: string, handler: Handler): () => void {
    let set = this.channels.get(topic);
    if (!set) {
      set = new Set();
      this.channels.set(topic, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set?.size === 0) this.channels.delete(topic);
    };
  }

  /** Stats for observability. */
  topicCount(): number {
    return this.channels.size;
  }

  subscriberCount(topic: string): number {
    return this.channels.get(topic)?.size ?? 0;
  }
}

export const bus = new InMemoryBus();
export type EventBus = InMemoryBus;
