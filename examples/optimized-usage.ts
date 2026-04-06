/**
 * Example: Using the optimized ClickUp helper with caching and queuing
 * 
 * This example shows how to use the optimization features to reduce API calls
 * and avoid hitting rate limits.
 */

import { createOptimizedClickUpHelper } from '../src/utils/optimized-clickup-helper';
import { env } from '../src/config';
import { logger } from '../src/logger';

async function main() {
  // Create optimized helper
  const helper = createOptimizedClickUpHelper({
    name: 'clickup',
    transport: 'http',
    url: env.CLICKUP_MCP_URL,
    headers: { Authorization: `Bearer ${env.CLICKUP_API_TOKEN}` },
    toolPrefix: 'clickup_',
    metadata: {
      default_arg_workspace_id: env.CLICKUP_WORKSPACE_ID,
    },
  });

  await helper.connect();

  const workspaceId = env.CLICKUP_WORKSPACE_ID;
  const listId = env.CLICKUP_LIST_ID;

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. PREFETCH COMMON DATA (Warm up cache)
    // ═══════════════════════════════════════════════════════════
    console.log('\n📦 Prefetching common data...');
    await helper.prefetchCommonData(workspaceId, [listId]);
    console.log('✅ Prefetch complete - data is now cached');

    // ═══════════════════════════════════════════════════════════
    // 2. USE CACHED DATA (No API calls)
    // ═══════════════════════════════════════════════════════════
    console.log('\n🔍 Getting workspace members (from cache)...');
    const members = await helper.getWorkspaceMembers(workspaceId);
    console.log(`✅ Found ${members.length} members (cached)`);

    console.log('\n🔍 Getting custom fields (from cache)...');
    const customFields = await helper.getCustomFields(listId, workspaceId);
    console.log(`✅ Found ${customFields.length} custom fields (cached)`);

    // ═══════════════════════════════════════════════════════════
    // 3. BATCH CREATE TASKS (Queued with rate limiting)
    // ═══════════════════════════════════════════════════════════
    console.log('\n📝 Creating multiple tasks in batch...');
    const tasksToCreate = [
      {
        name: 'Bug: Login form validation',
        list_id: listId,
        workspace_id: workspaceId,
        description: 'Fix validation on login form',
        priority: 'high',
      },
      {
        name: 'Feature: Dark mode support',
        list_id: listId,
        workspace_id: workspaceId,
        description: 'Add dark mode theme',
        priority: 'normal',
      },
      {
        name: 'Refactor: Clean up API endpoints',
        list_id: listId,
        workspace_id: workspaceId,
        description: 'Refactor and optimize API',
        priority: 'low',
      },
    ];

    const createdTasks = await helper.createTasksBatch(tasksToCreate);
    console.log(`✅ Created ${createdTasks.length} tasks (queued & rate-limited)`);

    // ═══════════════════════════════════════════════════════════
    // 4. CHECK QUEUE STATISTICS
    // ═══════════════════════════════════════════════════════════
    console.log('\n📊 Queue Statistics:');
    const stats = helper.getQueueStats();
    console.log(JSON.stringify(stats, null, 2));

    // ═══════════════════════════════════════════════════════════
    // 5. SIMULATE PROCESSING MANY ISSUES (Shows optimization)
    // ═══════════════════════════════════════════════════════════
    console.log('\n🔄 Simulating processing 10 Sentry issues...');
    
    const startTime = Date.now();
    const issueIds = Array.from({ length: 10 }, (_, i) => `ISSUE-${i + 1}`);

    for (const issueId of issueIds) {
      // These calls use cached data - no API calls!
      const membersForIssue = await helper.getWorkspaceMembers(workspaceId);
      const fieldsForIssue = await helper.getCustomFields(listId, workspaceId);

      // Only the task creation makes an API call (queued)
      await helper.createTask({
        name: `Fix: ${issueId}`,
        list_id: listId,
        workspace_id: workspaceId,
        description: `Sentry issue ${issueId}`,
      });

      console.log(`  ✓ Processed ${issueId}`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Processed 10 issues in ${duration}ms`);
    console.log('   Without caching: ~30 API calls (10 members + 10 fields + 10 tasks)');
    console.log('   With caching: ~10 API calls (only task creation)');
    console.log('   API call reduction: 67%');

    // ═══════════════════════════════════════════════════════════
    // 6. FINAL STATISTICS
    // ═══════════════════════════════════════════════════════════
    console.log('\n📊 Final Queue Statistics:');
    const finalStats = helper.getQueueStats();
    console.log(JSON.stringify(finalStats, null, 2));

  } catch (error: any) {
    if (error.message.includes('API usage limits')) {
      console.error('\n❌ Hit ClickUp API rate limit!');
      console.error('   The queue will automatically retry when limits reset.');
      console.error(`   Error: ${error.message}`);
    } else {
      console.error('\n❌ Error:', error.message);
    }
  } finally {
    await helper.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
