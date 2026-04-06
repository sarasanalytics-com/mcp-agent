import { logger } from '../logger';

export interface QueuedRequest<T = any> {
  id: string;
  fn: () => Promise<T>;
  priority: number;
  timestamp: number;
  retries: number;
  maxRetries: number;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxConcurrent: number;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private activeRequests = 0;
  private requestTimestamps: number[] = [];
  
  constructor(private config: RateLimitConfig) {}

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: this.generateId(),
        fn,
        priority: options.priority ?? 5,
        timestamp: Date.now(),
        retries: 0,
        maxRetries: options.maxRetries ?? 3,
        resolve,
        reject,
      };

      this.queue.push(request);
      this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first

      logger.debug('Request enqueued', {
        id: request.id,
        priority: request.priority,
        queueSize: this.queue.length,
      });

      this.processQueue();
    });
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Check rate limits
      if (!this.canMakeRequest()) {
        const waitTime = this.getWaitTime();
        logger.info('Rate limit reached, waiting', { waitTime });
        await this.sleep(waitTime);
        continue;
      }

      // Check concurrent limit
      if (this.activeRequests >= this.config.maxConcurrent) {
        await this.sleep(100);
        continue;
      }

      const request = this.queue.shift();
      if (!request) {
        break;
      }

      this.executeRequest(request);
    }

    this.processing = false;
  }

  /**
   * Execute a single request
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    this.activeRequests++;
    this.requestTimestamps.push(Date.now());

    try {
      logger.debug('Executing request', { id: request.id, activeRequests: this.activeRequests });
      const result = await request.fn();
      request.resolve(result);
    } catch (error: any) {
      logger.error('Request failed', {
        id: request.id,
        retries: request.retries,
        maxRetries: request.maxRetries,
        error: error.message,
      });

      // Retry logic
      if (request.retries < request.maxRetries && this.isRetryableError(error)) {
        request.retries++;
        this.queue.unshift(request); // Add back to front of queue
        logger.info('Retrying request', { id: request.id, retries: request.retries });
      } else {
        request.reject(error);
      }
    } finally {
      this.activeRequests--;
      this.cleanupTimestamps();
      this.processQueue(); // Continue processing
    }
  }

  /**
   * Check if we can make a request based on rate limits
   */
  private canMakeRequest(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    const requestsLastMinute = this.requestTimestamps.filter(t => t > oneMinuteAgo).length;
    const requestsLastHour = this.requestTimestamps.filter(t => t > oneHourAgo).length;

    return (
      requestsLastMinute < this.config.maxRequestsPerMinute &&
      requestsLastHour < this.config.maxRequestsPerHour
    );
  }

  /**
   * Calculate how long to wait before making next request
   */
  private getWaitTime(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    const recentRequests = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    
    if (recentRequests.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...recentRequests);
      return Math.max(1000, oldestRequest + 60 * 1000 - now);
    }

    return 1000; // Default 1 second
  }

  /**
   * Clean up old timestamps
   */
  private cleanupTimestamps(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneHourAgo);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const message = error.message || '';
    
    // Don't retry rate limit errors
    if (message.includes('rate limit') || message.includes('API usage limits')) {
      return false;
    }

    // Retry on network errors
    if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT')) {
      return true;
    }

    // Retry on 5xx errors
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }

    return false;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests,
      requestsLastMinute: this.requestTimestamps.filter(t => t > oneMinuteAgo).length,
      requestsLastHour: this.requestTimestamps.filter(t => t > oneHourAgo).length,
      limits: this.config,
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    logger.info('Queue cleared');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
