# API Optimization Guide

This document explains how to use the caching and queuing system to optimize API usage and avoid hitting rate limits.

## Overview

The system includes three main optimization features:

1. **Caching Layer** - Stores frequently accessed data to reduce API calls
2. **Request Queue** - Rate limits and queues API requests to stay within limits
3. **Batch Operations** - Executes multiple operations efficiently

## Architecture

```
┌─────────────────┐
│  Your Code      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ CachedMCPProvider       │
│ - Checks cache first    │
│ - Queues requests       │
│ - Caches results        │
└────────┬────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│ Cache  │ │  Queue   │
└────────┘ └──────────┘
```

## Configuration

Add these environment variables to your `.env` file:

```bash
# Rate Limiting (requests per time period)
CLICKUP_MAX_REQUESTS_PER_MINUTE=50
CLICKUP_MAX_REQUESTS_PER_HOUR=1000
CLICKUP_MAX_CONCURRENT_REQUESTS=5

# Cache TTL (time-to-live in milliseconds)
CACHE_TTL_WORKSPACE_HIERARCHY=1800000  # 30 minutes
CACHE_TTL_WORKSPACE_MEMBERS=3600000    # 1 hour
CACHE_TTL_LIST_DETAILS=1800000         # 30 minutes
CACHE_TTL_CUSTOM_FIELDS=3600000        # 1 hour
```

### Recommended Settings by ClickUp Plan

**Free Plan:**
```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=30
CLICKUP_MAX_REQUESTS_PER_HOUR=500
```

**Unlimited Plan:**
```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=50
CLICKUP_MAX_REQUESTS_PER_HOUR=1000
```

**Business/Enterprise:**
```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=100
CLICKUP_MAX_REQUESTS_PER_HOUR=5000
```

## Usage Examples

### Basic Usage with Caching

```typescript
import { createOptimizedClickUpHelper } from './utils/optimized-clickup-helper';

const helper = createOptimizedClickUpHelper({
  name: 'clickup',
  transport: 'http',
  url: process.env.CLICKUP_MCP_URL,
  headers: { Authorization: `Bearer ${process.env.CLICKUP_API_TOKEN}` },
  metadata: {
    default_arg_workspace_id: process.env.CLICKUP_WORKSPACE_ID,
  },
});

await helper.connect();

// This will cache the result for 1 hour
const members = await helper.getWorkspaceMembers(workspaceId);

// Subsequent calls use cached data (no API call)
const membersCached = await helper.getWorkspaceMembers(workspaceId);
```

### Batch Operations

```typescript
// Create multiple tasks efficiently
const tasks = [
  { name: 'Task 1', list_id: '123', workspace_id: 'ws1' },
  { name: 'Task 2', list_id: '123', workspace_id: 'ws1' },
  { name: 'Task 3', list_id: '123', workspace_id: 'ws1' },
];

// All tasks are queued and executed with rate limiting
const results = await helper.createTasksBatch(tasks);
```

### Prefetching Data

```typescript
// Warm up cache at startup to reduce API calls during operation
await helper.prefetchCommonData(
  workspaceId,
  ['list1', 'list2', 'list3']
);

// Now these calls will use cached data
const customFields = await helper.getCustomFields('list1', workspaceId);
```

### Priority-Based Execution

```typescript
import { CachedMCPProvider } from './mcp/cached-provider';

const provider = new CachedMCPProvider(config);

// High priority - executes first
await provider.callToolWithOptimization(
  'clickup_create_task',
  { name: 'Urgent task', list_id: '123' },
  { priority: 'high' }
);

// Normal priority
await provider.callToolWithOptimization(
  'clickup_get_task',
  { task_id: '456' },
  { priority: 'normal' }
);

// Low priority - executes last
await provider.callToolWithOptimization(
  'clickup_get_workspace_hierarchy',
  { workspace_id: 'ws1' },
  { priority: 'low' }
);
```

### Bypassing Cache and Queue

```typescript
// Bypass cache to get fresh data
const freshTask = await provider.callToolWithOptimization(
  'clickup_get_task',
  { task_id: '123' },
  { bypassCache: true }
);

// Bypass queue for immediate execution (use sparingly!)
const immediateResult = await provider.callToolWithOptimization(
  'clickup_create_task',
  { name: 'Immediate task', list_id: '123' },
  { bypassQueue: true, priority: 'high' }
);
```

## Monitoring

### Check Queue Statistics

```typescript
const stats = helper.getQueueStats();
console.log(stats);
// {
//   queueSize: 5,
//   activeRequests: 2,
//   requestsLastMinute: 15,
//   requestsLastHour: 234,
//   limits: {
//     maxRequestsPerMinute: 50,
//     maxRequestsPerHour: 1000,
//     maxConcurrent: 5
//   }
// }
```

### Clear Cache

```typescript
// Clear cache for specific workspace
helper.clearCache(workspaceId);

// Clear all cache
helper.clearCache();
```

## Best Practices

### 1. Cache Read-Heavy Operations

Always use caching for:
- Workspace members
- Workspace hierarchy
- List details
- Custom field definitions
- Folder/space details

```typescript
// ✅ Good - uses cache
const members = await helper.getWorkspaceMembers(workspaceId);

// ❌ Bad - bypasses cache unnecessarily
const members = await provider.callToolWithOptimization(
  'clickup_get_workspace_members',
  { workspace_id: workspaceId },
  { bypassCache: true }
);
```

### 2. Use Batch Operations

```typescript
// ✅ Good - batched
const results = await helper.createTasksBatch(tasks);

// ❌ Bad - sequential
for (const task of tasks) {
  await helper.createTask(task);
}
```

### 3. Prefetch at Startup

```typescript
// ✅ Good - prefetch common data
await helper.prefetchCommonData(workspaceId, listIds);

// Then use cached data during operation
const fields = await helper.getCustomFields(listId, workspaceId);
```

### 4. Set Appropriate Priorities

```typescript
// High priority for user-facing operations
await provider.callToolWithOptimization(
  'clickup_create_task',
  args,
  { priority: 'high' }
);

// Low priority for background/prefetch operations
await provider.callToolWithOptimization(
  'clickup_get_workspace_hierarchy',
  args,
  { priority: 'low' }
);
```

### 5. Handle Rate Limit Errors

```typescript
try {
  await helper.createTask(args);
} catch (error) {
  if (error.message.includes('API usage limits')) {
    // Log the error and inform user
    logger.error('ClickUp API limit reached', { error });
    
    // Optionally queue for later or use fallback
    // The queue will automatically retry when limits reset
  }
  throw error;
}
```

## Cache Invalidation

The cache automatically expires based on TTL settings. You can also manually invalidate:

```typescript
// Invalidate all cache
clickupCache.invalidateAll();

// Invalidate workspace-specific cache
clickupCache.invalidateWorkspace(workspaceId);

// Invalidate specific cache entries
cache.delete(`list:${listId}`);
```

## Performance Impact

### Without Optimization
- 100 requests to get workspace members = 100 API calls
- Risk of hitting rate limits
- Slower response times

### With Optimization
- 100 requests to get workspace members = 1 API call (cached)
- Automatic rate limiting prevents errors
- Faster response times (cache hits)

### Example Savings

For a typical workflow processing 50 Sentry issues:

**Before:**
- 50 × get workspace members = 50 API calls
- 50 × get custom fields = 50 API calls
- 50 × create task = 50 API calls
- **Total: 150 API calls**

**After:**
- 1 × get workspace members (cached) = 1 API call
- 1 × get custom fields (cached) = 1 API call
- 50 × create task (queued) = 50 API calls
- **Total: 52 API calls (65% reduction)**

## Troubleshooting

### Queue is Growing
- Increase `CLICKUP_MAX_REQUESTS_PER_MINUTE`
- Increase `CLICKUP_MAX_CONCURRENT_REQUESTS`
- Check if you're hitting API limits

### Cache Not Working
- Verify cache TTL settings
- Check if `bypassCache: true` is being used
- Ensure workspace IDs match

### Still Hitting Rate Limits
- Lower rate limit settings
- Increase cache TTL
- Use more batch operations
- Implement prefetching

## Migration Guide

### Updating Existing Code

**Before:**
```typescript
const result = await mcpProvider.executeTool('clickup_get_workspace_members', args);
```

**After:**
```typescript
const result = await cachedProvider.callToolWithOptimization(
  'clickup_get_workspace_members',
  args,
  { priority: 'low' }
);
```

Or use the helper:
```typescript
const result = await helper.getWorkspaceMembers(workspaceId);
```
