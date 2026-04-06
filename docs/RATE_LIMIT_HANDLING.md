# Rate Limit Handling Guide

## Understanding ClickUp Rate Limits

ClickUp enforces API rate limits based on your workspace plan:

| Plan | Requests/Minute | Requests/Hour | Monthly Limit |
|------|----------------|---------------|---------------|
| Free | ~30 | ~500 | Varies |
| Unlimited | ~50 | ~1,000 | Varies |
| Business | ~100 | ~5,000 | Higher |
| Enterprise | Custom | Custom | Custom |

When you hit the limit, you'll see an error like:
```
Error: 400 {"type":"error","error":{"type":"invalid_request_error",
"message":"You have reached your specified workspace API usage limits. 
You will regain access on 2026-05-01 at 00:00 UTC."}}
```

## How the Optimization System Helps

### 1. **Caching** - Reduces Redundant Calls

The system caches frequently accessed data:

```typescript
// First call - hits API
const members = await helper.getWorkspaceMembers(workspaceId);

// Subsequent calls - uses cache (no API call)
const membersCached = await helper.getWorkspaceMembers(workspaceId);
```

**What gets cached:**
- Workspace members (1 hour TTL)
- Workspace hierarchy (30 min TTL)
- List details (30 min TTL)
- Custom fields (1 hour TTL)
- Folder/space details (30 min TTL)

### 2. **Request Queue** - Prevents Limit Violations

The queue system:
- Limits requests per minute/hour
- Queues excess requests automatically
- Retries failed requests with backoff
- Respects concurrent request limits

```typescript
// All requests are automatically queued
await helper.createTask(args); // Queued
await helper.updateTask(args); // Queued
await helper.getTask(taskId);  // Queued
```

### 3. **Batch Operations** - Efficient Processing

```typescript
// Instead of 50 sequential calls
for (const task of tasks) {
  await createTask(task); // ❌ 50 API calls
}

// Use batch processing
await helper.createTasksBatch(tasks); // ✅ Queued efficiently
```

## Configuration for Your Plan

### Free Plan (Conservative)

```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=20
CLICKUP_MAX_REQUESTS_PER_HOUR=400
CLICKUP_MAX_CONCURRENT_REQUESTS=2

# Longer cache to reduce calls
CACHE_TTL_WORKSPACE_MEMBERS=7200000  # 2 hours
CACHE_TTL_CUSTOM_FIELDS=7200000      # 2 hours
```

### Unlimited Plan (Balanced)

```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=50
CLICKUP_MAX_REQUESTS_PER_HOUR=1000
CLICKUP_MAX_CONCURRENT_REQUESTS=5

# Standard cache
CACHE_TTL_WORKSPACE_MEMBERS=3600000  # 1 hour
CACHE_TTL_CUSTOM_FIELDS=3600000      # 1 hour
```

### Business/Enterprise (Aggressive)

```bash
CLICKUP_MAX_REQUESTS_PER_MINUTE=100
CLICKUP_MAX_REQUESTS_PER_HOUR=5000
CLICKUP_MAX_CONCURRENT_REQUESTS=10

# Shorter cache for fresher data
CACHE_TTL_WORKSPACE_MEMBERS=1800000  # 30 min
CACHE_TTL_CUSTOM_FIELDS=1800000      # 30 min
```

## Monitoring API Usage

### Check Queue Status

```typescript
const stats = helper.getQueueStats();
console.log(stats);
```

Output:
```json
{
  "queueSize": 5,           // Pending requests
  "activeRequests": 2,      // Currently executing
  "requestsLastMinute": 15, // Recent usage
  "requestsLastHour": 234,  // Hourly usage
  "limits": {
    "maxRequestsPerMinute": 50,
    "maxRequestsPerHour": 1000,
    "maxConcurrent": 5
  }
}
```

### Warning Signs

🚨 **You're approaching limits if:**
- `requestsLastMinute` is close to `maxRequestsPerMinute`
- `requestsLastHour` is close to `maxRequestsPerHour`
- `queueSize` keeps growing

**Actions to take:**
1. Lower rate limit settings
2. Increase cache TTL
3. Implement prefetching
4. Use more batch operations

## Recovery Strategies

### When You Hit the Limit

The system automatically handles rate limit errors:

1. **Queue pauses** - Stops making requests
2. **Waits for reset** - Calculates wait time
3. **Resumes automatically** - Continues when safe

You can also:

```typescript
// Clear the queue if needed
helper.clearCache();

// Check when you can resume
const stats = helper.getQueueStats();
if (stats.requestsLastHour >= stats.limits.maxRequestsPerHour) {
  console.log('Waiting for hourly limit to reset...');
}
```

### Fallback Options

If you're consistently hitting limits:

1. **Use a different workspace** (new quota)
2. **Upgrade your ClickUp plan**
3. **Implement offline queuing** (process later)
4. **Manual fallback** (log to file, create tasks manually)

## Best Practices to Avoid Limits

### ✅ DO

- Prefetch common data at startup
- Use caching for read operations
- Batch create/update operations
- Set appropriate rate limits
- Monitor queue statistics

### ❌ DON'T

- Bypass cache unnecessarily
- Make sequential API calls in loops
- Set rate limits too high
- Ignore queue statistics
- Poll for updates frequently

## Example: Processing 100 Sentry Issues

### Without Optimization
```typescript
for (const issue of issues) {
  const members = await getMembers();      // 100 calls
  const fields = await getCustomFields();  // 100 calls
  await createTask(issue);                 // 100 calls
}
// Total: 300 API calls - WILL HIT LIMITS!
```

### With Optimization
```typescript
// Prefetch once
await helper.prefetchCommonData(workspaceId, [listId]);

// Process with cache
for (const issue of issues) {
  const members = await helper.getWorkspaceMembers(workspaceId);  // Cached
  const fields = await helper.getCustomFields(listId, workspaceId); // Cached
  await helper.createTask(issue);  // Queued
}
// Total: ~102 API calls (2 prefetch + 100 tasks) - SAFE!
```

## Troubleshooting

### Queue Not Processing

**Check:**
```typescript
const stats = helper.getQueueStats();
console.log('Queue size:', stats.queueSize);
console.log('Active:', stats.activeRequests);
```

**Possible causes:**
- Hit rate limits (wait for reset)
- All workers busy (increase `maxConcurrent`)
- Connection issues (check logs)

### Cache Not Working

**Check:**
```typescript
// Verify cache hit
const members1 = await helper.getWorkspaceMembers(workspaceId);
const members2 = await helper.getWorkspaceMembers(workspaceId);
// Should be instant on second call
```

**Possible causes:**
- Different workspace IDs
- Cache expired (check TTL)
- Using `bypassCache: true`

### Still Getting Rate Limit Errors

**Solutions:**
1. Lower `CLICKUP_MAX_REQUESTS_PER_MINUTE`
2. Increase cache TTL values
3. Add delays between operations
4. Contact ClickUp support for higher limits

## Summary

The optimization system provides three layers of protection:

1. **Cache** - Eliminates redundant API calls
2. **Queue** - Enforces rate limits automatically
3. **Batch** - Processes multiple operations efficiently

Together, these can reduce API calls by **60-90%** and prevent rate limit errors.
