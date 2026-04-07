/**
 * Deduplication cache to prevent processing duplicate/similar issues
 * Saves massive LLM costs when Sentry floods similar errors
 */

interface CacheEntry {
  issueId: string;
  ticketId?: string;
  ticketUrl?: string;
  processedAt: number;
  hash: string;
}

export class DeduplicationCache {
  private cache = new Map<string, CacheEntry>();
  private cooldownMs: number;

  constructor(cooldownMs = 10 * 60 * 1000) {
    // Default: 10 minutes
    this.cooldownMs = cooldownMs;
  }

  /**
   * Check if issue was recently processed
   * Returns existing ticket info if found
   */
  check(hash: string, issueId: string): CacheEntry | null {
    const entry = this.cache.get(hash);
    if (!entry) return null;

    const age = Date.now() - entry.processedAt;
    if (age > this.cooldownMs) {
      // Expired, remove from cache
      this.cache.delete(hash);
      return null;
    }

    // Check if same issue ID (exact duplicate)
    if (entry.issueId === issueId) {
      return entry;
    }

    // Different issue ID but same hash (similar error)
    return entry;
  }

  /**
   * Store processed issue
   */
  store(hash: string, issueId: string, ticketId?: string, ticketUrl?: string): void {
    this.cache.set(hash, {
      issueId,
      ticketId,
      ticketUrl,
      processedAt: Date.now(),
      hash,
    });
  }

  /**
   * Clear expired entries (run periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [hash, entry] of this.cache.entries()) {
      if (now - entry.processedAt > this.cooldownMs) {
        this.cache.delete(hash);
      }
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      cooldownMs: this.cooldownMs,
    };
  }
}

// Global singleton
export const deduplicationCache = new DeduplicationCache();

// Cleanup every 5 minutes
setInterval(() => deduplicationCache.cleanup(), 5 * 60 * 1000);
