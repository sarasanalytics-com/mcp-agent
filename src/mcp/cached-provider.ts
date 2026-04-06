import { BaseMCPProvider } from './base-provider';
import { clickupCache } from '../cache/clickup-cache';
import { clickupQueue } from '../queue/clickup-queue';
import { logger } from '../logger';
import type { MCPProviderConfig } from './types';

/**
 * Wrapper around MCP provider that adds caching and queuing
 */
export class CachedMCPProvider extends BaseMCPProvider {
  constructor(config: MCPProviderConfig, opts?: { retries?: number; timeoutMs?: number; cacheTtlMs?: number }) {
    super(config, opts);
  }

  /**
   * Execute MCP tool with caching and queuing
   */
  async callToolWithOptimization(
    toolName: string,
    args: Record<string, any>,
    options: {
      priority?: 'high' | 'normal' | 'low';
      bypassCache?: boolean;
      bypassQueue?: boolean;
    } = {}
  ): Promise<any> {
    // Check cache for read-only operations
    if (!options.bypassCache) {
      const cached = this.getCachedResult(toolName, args);
      if (cached !== null) {
        logger.info('Using cached result', { toolName, args });
        return cached;
      }
    }

    // Execute with queue for rate limiting
    const executeFn = async () => {
      const result = await this.executeTool(toolName, args);
      // Parse JSON result if it's a string
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    };

    const result = options.bypassQueue
      ? await executeFn()
      : await clickupQueue.execute(executeFn, { priority: options.priority });

    // Cache the result for read operations
    this.cacheResult(toolName, args, result);

    return result;
  }

  /**
   * Get cached result for read-only operations
   */
  private getCachedResult(toolName: string, args: Record<string, any>): any | null {
    const workspaceId = args.workspace_id;

    switch (toolName) {
      case 'clickup_get_workspace_hierarchy':
        return clickupCache.getWorkspaceHierarchy(workspaceId);

      case 'clickup_get_workspace_members':
        return clickupCache.getWorkspaceMembers(workspaceId);

      case 'clickup_get_list':
        if (args.list_id) {
          return clickupCache.getListDetails(args.list_id);
        }
        break;

      case 'clickup_get_custom_fields':
        if (args.list_id) {
          return clickupCache.getCustomFields(args.list_id);
        }
        break;

      case 'clickup_get_folder':
        if (args.folder_id) {
          return clickupCache.getFolderDetails(args.folder_id);
        }
        break;

      case 'clickup_find_member_by_name':
        if (args.name_or_email) {
          const byEmail = clickupCache.getMemberByEmail(workspaceId, args.name_or_email);
          if (byEmail) return byEmail;
          
          const byUsername = clickupCache.getMemberByUsername(workspaceId, args.name_or_email);
          if (byUsername) return byUsername;
        }
        break;
    }

    return null;
  }

  /**
   * Cache result for read operations
   */
  private cacheResult(toolName: string, args: Record<string, any>, result: any): void {
    if (!result) return;

    const workspaceId = args.workspace_id;

    try {
      switch (toolName) {
        case 'clickup_get_workspace_hierarchy':
          clickupCache.setWorkspaceHierarchy(workspaceId, result);
          break;

        case 'clickup_get_workspace_members':
          if (Array.isArray(result)) {
            clickupCache.setWorkspaceMembers(workspaceId, result);
          }
          break;

        case 'clickup_get_list':
          if (args.list_id && result.id) {
            clickupCache.setListDetails(args.list_id, result);
          }
          break;

        case 'clickup_get_custom_fields':
          if (args.list_id && Array.isArray(result)) {
            clickupCache.setCustomFields(args.list_id, result);
          }
          break;

        case 'clickup_get_folder':
          if (args.folder_id && result.id) {
            clickupCache.setFolderDetails(args.folder_id, result);
          }
          break;

        case 'clickup_find_member_by_name':
          if (result && result.id) {
            // Cache is already handled in setWorkspaceMembers
          }
          break;
      }
    } catch (error: any) {
      logger.warn('Failed to cache result', { toolName, error: error.message });
    }
  }

  /**
   * Batch execute multiple tools
   */
  async callToolsBatch(
    calls: Array<{
      toolName: string;
      args: Record<string, any>;
      priority?: 'high' | 'normal' | 'low';
    }>
  ): Promise<any[]> {
    logger.info('Executing batch tool calls', { count: calls.length });

    return clickupQueue.executeBatch(
      calls.map(call => ({
        fn: async () => {
          const result = await this.executeTool(call.toolName, call.args);
          try {
            return JSON.parse(result);
          } catch {
            return result;
          }
        },
        priority: call.priority,
      }))
    );
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return clickupQueue.getStats();
  }

  /**
   * Clear cache for workspace
   */
  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      clickupCache.invalidateWorkspace(workspaceId);
    } else {
      clickupCache.invalidateAll();
    }
  }
}
