export interface ReplayMetadata {
  transactionHash: string;
  sourceAccount: string;
  sequenceNumber: string;
  timestamp: number;
  network: string;
}

export interface ReplayCacheConfig {
  maxEntries: number;
  ttlMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: ReplayCacheConfig = {
  maxEntries: 10000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

export class StellarReplayProtectionCache {
  private cache: Map<string, ReplayMetadata> = new Map();
  private config: ReplayCacheConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ReplayCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Store replay metadata for a transaction.
   */
  store(metadata: ReplayMetadata): void {
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(this.buildKey(metadata), metadata);
  }

  /**
   * Fast validation: returns true if the transaction is a replay (duplicate).
   */
  isReplay(transactionHash: string, sourceAccount: string, sequenceNumber: string): boolean {
    const key = `${transactionHash}:${sourceAccount}:${sequenceNumber}`;
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get stored metadata for a transaction.
   */
  get(transactionHash: string, sourceAccount: string, sequenceNumber: string): ReplayMetadata | null {
    const key = `${transactionHash}:${sourceAccount}:${sequenceNumber}`;
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.cache.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Stop background cleanup.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private buildKey(metadata: ReplayMetadata): string {
    return `${metadata.transactionHash}:${metadata.sourceAccount}:${metadata.sequenceNumber}`;
  }

  private isExpired(entry: ReplayMetadata): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, meta] of this.cache) {
      if (meta.timestamp < oldestTime) {
        oldestTime = meta.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      for (const [key, entry] of this.cache) {
        if (this.isExpired(entry)) {
          this.cache.delete(key);
        }
      }
    }, this.config.cleanupIntervalMs);
  }
}
