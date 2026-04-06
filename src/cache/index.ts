import { logger } from '../logger';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class Cache {
  private store: Map<string, CacheEntry<any>> = new Map();

  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      logger.debug('Cache expired', { key, age, ttl: entry.ttl });
      this.store.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key, age, ttl: entry.ttl });
    return entry.data as T;
  }

  /**
   * Set cached data with TTL in milliseconds
   */
  set<T>(key: string, data: T, ttl: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
    logger.debug('Cache set', { key, ttl });
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): void {
    this.store.delete(key);
    logger.debug('Cache deleted', { key });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cache cleanup completed', { cleaned, remaining: this.store.size });
    }
  }
}

// Global cache instance
export const cache = new Cache();

// Run cleanup every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);
