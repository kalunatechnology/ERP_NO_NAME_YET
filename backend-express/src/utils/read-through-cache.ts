type CacheEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

export type CacheState = 'HIT' | 'MISS' | 'STALE';

type ReadThroughOptions = {
  ttlMs: number;
  staleMs: number;
  timeoutMs: number;
};

/**
 * Small bounded process cache for expensive, read-only BFF projections.
 * Keys must contain tenant and company identity. It deliberately does not
 * cache authentication decisions or mutation responses.
 */
export class ReadThroughCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 250) {}

  async get(
    key: string,
    loader: () => Promise<T>,
    options: ReadThroughOptions,
  ): Promise<{ value: T; state: CacheState }> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.freshUntil > now) {
      this.touch(key, cached);
      return { value: cached.value, state: 'HIT' };
    }

    const load = this.pending.get(key) ?? this.startLoad(key, loader, options, cached);
    if (!cached || cached.staleUntil <= now) {
      return { value: await load, state: 'MISS' };
    }

    const timeout = new Promise<symbol>((resolve) => {
      const timer = setTimeout(() => resolve(STALE_TIMEOUT), options.timeoutMs);
      timer.unref?.();
    });
    const result = await Promise.race([load, timeout]);
    if (result === STALE_TIMEOUT) {
      this.touch(key, cached);
      return { value: cached.value, state: 'STALE' };
    }
    return { value: result as T, state: 'MISS' };
  }

  clear(): void {
    this.entries.clear();
  }

  private startLoad(
    key: string,
    loader: () => Promise<T>,
    options: ReadThroughOptions,
    stale?: CacheEntry<T>,
  ): Promise<T> {
    const promise = loader()
      .then((value) => {
        const now = Date.now();
        this.entries.set(key, {
          value,
          freshUntil: now + options.ttlMs,
          staleUntil: now + options.ttlMs + options.staleMs,
        });
        this.evictOverflow();
        return value;
      })
      .catch((error) => {
        if (stale && stale.staleUntil > Date.now()) return stale.value;
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private touch(key: string, entry: CacheEntry<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) return;
      this.entries.delete(oldest);
    }
  }
}

const STALE_TIMEOUT = Symbol('STALE_TIMEOUT');
