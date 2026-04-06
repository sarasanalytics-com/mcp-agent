import { mcpRegistry } from './registry';
import { CachedMCPProvider } from './cached-provider';
import { logger } from '../logger';
import { env } from '../config';

/**
 * Prefetch common ClickUp data at startup to warm up the cache
 * This significantly reduces API calls during operation
 */
export async function prefetchClickUpData(): Promise<void> {
  if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_WORKSPACE_ID) {
    logger.info('Skipping ClickUp prefetch - not configured');
    return;
  }

  const clickupProvider = mcpRegistry.get('clickup');
  if (!clickupProvider || !(clickupProvider instanceof CachedMCPProvider)) {
    logger.info('Skipping ClickUp prefetch - provider not optimized');
    return;
  }

  logger.info('Prefetching ClickUp data to warm cache...');
  const start = Date.now();

  try {
    const workspaceId = env.CLICKUP_WORKSPACE_ID;
    const listId = env.CLICKUP_LIST_ID;

    const prefetchCalls: Array<{
      toolName: string;
      args: Record<string, any>;
      priority: 'high' | 'normal' | 'low';
    }> = [
      {
        toolName: 'clickup_get_workspace_members',
        args: { workspace_id: workspaceId },
        priority: 'low',
      },
      {
        toolName: 'clickup_get_workspace_hierarchy',
        args: { workspace_id: workspaceId, max_depth: 2 },
        priority: 'low',
      },
    ];

    // Add list-specific prefetch if list ID is configured
    if (listId) {
      prefetchCalls.push({
        toolName: 'clickup_get_custom_fields',
        args: { list_id: listId, workspace_id: workspaceId },
        priority: 'low',
      });
    }

    await clickupProvider.callToolsBatch(prefetchCalls);

    const duration = Date.now() - start;
    logger.info('ClickUp prefetch completed', {
      duration,
      itemsCached: prefetchCalls.length,
    });
  } catch (error: any) {
    logger.warn('ClickUp prefetch failed (non-critical)', {
      error: error.message,
    });
  }
}
