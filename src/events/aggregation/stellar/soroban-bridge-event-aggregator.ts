export interface RawBridgeEvent {
  source: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  contractId?: string;
}

export interface NormalizedBridgeEvent {
  id: string;
  source: string;
  type: 'transfer' | 'mint' | 'burn' | 'approval' | 'unknown';
  from: string;
  to: string;
  amount: string;
  asset: string;
  contractId: string;
  timestamp: number;
  rawPayload: Record<string, unknown>;
}

export interface EventAggregatorConfig {
  bufferSize: number;
  flushIntervalMs: number;
  sources: string[];
}

export type EventListener = (events: NormalizedBridgeEvent[]) => void;

const DEFAULT_CONFIG: EventAggregatorConfig = {
  bufferSize: 100,
  flushIntervalMs: 5000,
  sources: [],
};

export class SorobanBridgeEventAggregator {
  private config: EventAggregatorConfig;
  private buffer: NormalizedBridgeEvent[] = [];
  private listeners: EventListener[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private eventCounter = 0;

  constructor(config: Partial<EventAggregatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushing();
  }

  /**
   * Ingest a raw bridge event, normalize it, and buffer for streaming.
   */
  ingest(event: RawBridgeEvent): NormalizedBridgeEvent {
    const normalized = this.normalize(event);
    this.buffer.push(normalized);
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
    return normalized;
  }

  /**
   * Subscribe to aggregated event streams.
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Manually flush buffered events to listeners.
   */
  flush(): void {
    if (this.buffer.length === 0) return;
    const events = [...this.buffer];
    this.buffer = [];
    for (const listener of this.listeners) {
      listener(events);
    }
  }

  /**
   * Stop the aggregator and flush remaining events.
   */
  destroy(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Normalize a raw event payload into a unified structure.
   */
  private normalize(event: RawBridgeEvent): NormalizedBridgeEvent {
    this.eventCounter++;
    return {
      id: `evt_${Date.now()}_${this.eventCounter}`,
      source: event.source,
      type: this.mapEventType(event.type),
      from: (event.payload.from as string) || '',
      to: (event.payload.to as string) || '',
      amount: String(event.payload.amount || '0'),
      asset: (event.payload.asset as string) || 'XLM',
      contractId: event.contractId || '',
      timestamp: event.timestamp,
      rawPayload: event.payload,
    };
  }

  private mapEventType(type: string): NormalizedBridgeEvent['type'] {
    const typeMap: Record<string, NormalizedBridgeEvent['type']> = {
      transfer: 'transfer',
      mint: 'mint',
      burn: 'burn',
      approval: 'approval',
      approve: 'approval',
    };
    return typeMap[type.toLowerCase()] || 'unknown';
  }

  private startFlushing(): void {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }
}
