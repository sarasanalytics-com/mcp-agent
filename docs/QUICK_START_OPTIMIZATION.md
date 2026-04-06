# Quick Start: API Optimization

Get started with caching and rate limiting in 5 minutes.

## Step 1: Update Environment Variables

Add to your `.env` file:

```bash
# Rate Limiting (adjust based on your ClickUp plan)
CLICKUP_MAX_REQUESTS_PER_MINUTE=50
CLICKUP_MAX_REQUESTS_PER_HOUR=1000
CLICKUP_MAX_CONCURRENT_REQUESTS=5

# Cache TTL (in milliseconds)
CACHE_TTL_WORKSPACE_HIERARCHY=1800000  # 30 minutes
CACHE_TTL_WORKSPACE_MEMBERS=3600000    # 1 hour
CACHE_TTL_LIST_DETAILS=1800000         # 30 minutes
CACHE_TTL_CUSTOM_FIELDS=3600000        # 1 hour
```

## Step 2: Use the Optimized Helper

```typescript
import { createOptimizedClickUpHelper } from './src/utils/optimized-clickup-helper';
import { env } from './src/config';

// Create helper
const helper = createOptimizedClickUpHelper({
  name: 'clickup',
  transport: 'http',
  url: env.CLICKUP_MCP_URL,
  headers: { Authorization: `Bearer ${env.CLICKUP_API_TOKEN}` },
  metadata: {
    default_arg_workspace_id: env.CLICKUP_WORKSPACE_ID,
  },
});

await helper.connect();

// Prefetch common data (optional but recommended)
await helper.prefetchCommonData(
  env.CLICKUP_WORKSPACE_ID,
  [env.CLICKUP_LIST_ID]
);

// Use cached operations
const members = await helper.getWorkspaceMembers(env.CLICKUP_WORKSPACE_ID);
const fields = await helper.getCustomFields(env.CLICKUP_LIST_ID, env.CLICKUP_WORKSPACE_ID);

// Create tasks (automatically queued)
await helper.createTask({
  name: 'My Task',
  list_id: env.CLICKUP_LIST_ID,
  workspace_id: env.CLICKUP_WORKSPACE_ID,
});
```

## Step 3: Monitor Usage

```typescript
// Check queue statistics
const stats = helper.getQueueStats();
console.log('Queue:', stats.queueSize);
console.log('Requests/min:', stats.requestsLastMinute);
console.log('Requests/hour:', stats.requestsLastHour);
```

## That's It!

Your application now:
- ✅ Caches frequently accessed data
- ✅ Automatically rate limits requests
- ✅ Queues operations to prevent errors
- ✅ Reduces API calls by 60-90%

## Next Steps

- Read [OPTIMIZATION.md](../OPTIMIZATION.md) for detailed usage
- Read [RATE_LIMIT_HANDLING.md](./RATE_LIMIT_HANDLING.md) for troubleshooting
- Run the example: `npm run example:optimized`

## Common Patterns

### Pattern 1: Processing Multiple Issues

```typescript
// Prefetch once
await helper.prefetchCommonData(workspaceId, [listId]);

// Process many issues efficiently
for (const issue of issues) {
  // These use cache (no API calls)
  const members = await helper.getWorkspaceMembers(workspaceId);
  const fields = await helper.getCustomFields(listId, workspaceId);
  
  // Only this makes an API call (queued)
  await helper.createTask({
    name: issue.title,
    list_id: listId,
    workspace_id: workspaceId,
  });
}
```

### Pattern 2: Batch Operations

```typescript
const tasks = issues.map(issue => ({
  name: issue.title,
  list_id: listId,
  workspace_id: workspaceId,
}));

// Create all tasks efficiently
await helper.createTasksBatch(tasks);
```

### Pattern 3: Priority-Based Execution

```typescript
import { CachedMCPProvider } from './src/mcp/cached-provider';

const provider = new CachedMCPProvider(config);

// High priority - executes first
await provider.callToolWithOptimization(
  'clickup_create_task',
  args,
  { priority: 'high' }
);

// Low priority - executes last
await provider.callToolWithOptimization(
  'clickup_get_workspace_hierarchy',
  args,
  { priority: 'low' }
);
```
