# Usage Examples

This folder contains practical examples for using the MCP Agent client SDK.

## Quick Start

The easiest way to get started:

```bash
# 1. Make sure the server is running
bun run dev

# 2. In another terminal, run the quick start examples
bun run examples/quick-start.ts
```

## Files

- **`quick-start.ts`** — Copy-paste ready examples covering all common use cases
- **`client-usage.ts`** — Detailed examples with more advanced patterns

## Example 1: Process a Sentry Issue

```typescript
import { MCPAgentClient } from "../src/client";

const client = new MCPAgentClient({
  baseUrl: "http://localhost:3001",
  retries: 3,
  debug: true,
});

const result = await client.processSentryIssue({
  issueId: "7290814283",
});

console.log(result.agent.summary);
```

## Example 2: Generic Agent Run

```typescript
const result = await client.run({
  prompt: "Find all unresolved Sentry issues from the last 24h and create ClickUp tickets for the top 3"
});

console.log(result.agent.summary);
```

## Example 3: Custom Configuration

```typescript
const result = await client.run({
  prompt: "Analyze recent errors",
  systemPrompt: "You are a senior DevOps engineer...",
  providers: ["sentry"],  // Only use Sentry tools
  maxRounds: 5,
});
```

## Example 4: Check Service Health

```typescript
const health = await client.health();
console.log("Providers:", health.providers);

const { tools } = await client.listTools();
console.log(`Available tools: ${tools.length}`);
```

## Running Examples

Each example file can be run directly:

```bash
# Run quick start
bun run examples/quick-start.ts

# Run detailed examples
bun run examples/client-usage.ts
```

## Error Handling

All client methods throw `MCPAgentError` on failure:

```typescript
import { MCPAgentError } from "../src/client";

try {
  await client.run({ prompt: "..." });
} catch (error) {
  if (error instanceof MCPAgentError) {
    console.log("Status:", error.statusCode);
    console.log("Message:", error.message);
    console.log("Response:", error.response);
  }
}
```
