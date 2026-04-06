import { RequestQueue, RateLimitConfig } from './index';
import { logger } from '../logger';
import { env } from '../config';

export class ClickUpQueue {
  private queue: RequestQueue;

  constructor(config?: Partial<RateLimitConfig>) {
    const defaultConfig: RateLimitConfig = {
      maxRequestsPerMinute: env.CLICKUP_MAX_REQUESTS_PER_MINUTE,
      maxRequestsPerHour: env.CLICKUP_MAX_REQUESTS_PER_HOUR,
      maxConcurrent: env.CLICKUP_MAX_CONCURRENT_REQUESTS,
    };

    this.queue = new RequestQueue({
      ...defaultConfig,
      ...config,
    });

    logger.info('ClickUp queue initialized', { config: this.queue.getStats().limits });
  }

  /**
   * Queue a ClickUp API request
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: {
      priority?: 'high' | 'normal' | 'low';
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const priorityMap = {
      high: 10,
      normal: 5,
      low: 1,
    };

    return this.queue.enqueue(fn, {
      priority: priorityMap[options.priority ?? 'normal'],
      maxRetries: options.maxRetries ?? 3,
    });
  }

  /**
   * Batch multiple requests with automatic queuing
   */
  async executeBatch<T>(
    requests: Array<{
      fn: () => Promise<T>;
      priority?: 'high' | 'normal' | 'low';
    }>
  ): Promise<T[]> {
    logger.info('Executing batch requests', { count: requests.length });

    const promises = requests.map(req =>
      this.execute(req.fn, { priority: req.priority })
    );

    return Promise.all(promises);
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return this.queue.getStats();
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
  }
}

// Global ClickUp queue instance
export const clickupQueue = new ClickUpQueue();
