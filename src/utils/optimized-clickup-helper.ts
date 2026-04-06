import { CachedMCPProvider } from '../mcp/cached-provider';
import { clickupCache } from '../cache/clickup-cache';
import { clickupQueue } from '../queue/clickup-queue';
import { logger } from '../logger';
import type { MCPProviderConfig } from '../mcp/types';

/**
 * Helper class for optimized ClickUp operations with caching and queuing
 */
export class OptimizedClickUpHelper {
  private provider: CachedMCPProvider;

  constructor(config: MCPProviderConfig) {
    this.provider = new CachedMCPProvider(config);
  }

  async connect(): Promise<void> {
    await this.provider.connect();
  }

  /**
   * Get workspace members with caching
   * This will cache results for 1 hour by default
   */
  async getWorkspaceMembers(workspaceId: string): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_get_workspace_members',
      { workspace_id: workspaceId },
      { priority: 'low' } // Low priority since it's cached
    );
  }

  /**
   * Get workspace hierarchy with caching
   * This will cache results for 30 minutes by default
   */
  async getWorkspaceHierarchy(workspaceId: string): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_get_workspace_hierarchy',
      { workspace_id: workspaceId },
      { priority: 'low' }
    );
  }

  /**
   * Get list details with caching
   */
  async getListDetails(listId: string, workspaceId: string): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_get_list',
      { list_id: listId, workspace_id: workspaceId },
      { priority: 'low' }
    );
  }

  /**
   * Get custom fields with caching
   */
  async getCustomFields(listId: string, workspaceId: string): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_get_custom_fields',
      { list_id: listId, workspace_id: workspaceId },
      { priority: 'low' }
    );
  }

  /**
   * Create a task (high priority, no caching)
   */
  async createTask(args: Record<string, any>): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_create_task',
      args,
      { priority: 'high', bypassCache: true }
    );
  }

  /**
   * Update a task (high priority, no caching)
   */
  async updateTask(args: Record<string, any>): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_update_task',
      args,
      { priority: 'high', bypassCache: true }
    );
  }

  /**
   * Get task details (normal priority, no caching for fresh data)
   */
  async getTask(taskId: string, workspaceId: string): Promise<any> {
    return this.provider.callToolWithOptimization(
      'clickup_get_task',
      { task_id: taskId, workspace_id: workspaceId },
      { priority: 'normal', bypassCache: true }
    );
  }

  /**
   * Batch create multiple tasks efficiently
   */
  async createTasksBatch(tasks: Array<Record<string, any>>): Promise<any[]> {
    logger.info('Creating tasks in batch', { count: tasks.length });

    return this.provider.callToolsBatch(
      tasks.map(args => ({
        toolName: 'clickup_create_task',
        args,
        priority: 'high',
      }))
    );
  }

  /**
   * Prefetch common data to warm up cache
   * Call this at startup or periodically to reduce API calls
   */
  async prefetchCommonData(workspaceId: string, listIds: string[]): Promise<void> {
    logger.info('Prefetching common data', { workspaceId, listCount: listIds.length });

    const prefetchCalls = [
      {
        toolName: 'clickup_get_workspace_members',
        args: { workspace_id: workspaceId },
        priority: 'low' as const,
      },
      {
        toolName: 'clickup_get_workspace_hierarchy',
        args: { workspace_id: workspaceId },
        priority: 'low' as const,
      },
      ...listIds.map(listId => ({
        toolName: 'clickup_get_custom_fields',
        args: { list_id: listId, workspace_id: workspaceId },
        priority: 'low' as const,
      })),
    ];

    await this.provider.callToolsBatch(prefetchCalls);
    logger.info('Prefetch completed');
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.provider.getQueueStats();
  }

  /**
   * Clear cache for workspace
   */
  clearCache(workspaceId?: string): void {
    this.provider.clearCache(workspaceId);
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    await this.provider.disconnect();
  }
}

/**
 * Create an optimized ClickUp helper instance
 */
export function createOptimizedClickUpHelper(config: MCPProviderConfig): OptimizedClickUpHelper {
  return new OptimizedClickUpHelper(config);
}
