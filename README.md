# mcp-agent

A generic AI agent that connects to any MCP (Model Context Protocol) server and executes tasks via LLM-driven tool use. Ships with a built-in **Sentry → ClickUp** triage preset, but can be extended to any combination of MCP providers.

## Architecture

```
                     ┌──────────────────────────────┐
                     │        MCP Registry           │
                     │  ┌────────┐  ┌────────┐      │
  User Prompt ──▶    │  │ Sentry │  │ClickUp │ ...  │
  (or Webhook)       │  └───┬────┘  └───┬────┘      │
       │             └──────┼───────────┼───────────┘
       ▼                    │           │
  Anthropic LLM ◀──────────┴───────────┘
  (agentic tool-use loop)
       │
       ▼
  Result / Summary
```

- **MCP providers** are registered at startup from env vars (or programmatically).
- The **agent** discovers tools from all providers and runs an Anthropic tool-use loop.
- **Presets** (like Sentry→ClickUp) provide domain-specific system/user prompts.
- The generic **`POST /api/run`** endpoint accepts any prompt.

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

**Required:**

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |

**Optional MCP providers** (each is enabled when its token is set):

| Variable | Description |
|---|---|
| `SENTRY_AUTH_TOKEN` | Enables the Sentry MCP provider |
| `SENTRY_ORG_SLUG` | Sentry organization slug |
| `SENTRY_PROJECT_SLUG` | Sentry project slug |
| `CLICKUP_API_TOKEN` | Enables the ClickUp MCP provider |
| `CLICKUP_WORKSPACE_ID` | ClickUp workspace ID |
| `CLICKUP_LIST_ID` | Default ClickUp list ID for new tickets |
| `CLICKUP_MCP_URL` | ClickUp MCP URL (default: `https://mcp.clickup.com/mcp`) |

**Agent config:**

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Model to use |
| `AGENT_MAX_TOOL_ROUNDS` | `15` | Max tool-call rounds per run |
| `DEFAULT_SYSTEM_PROMPT` | (built-in) | Default system prompt |

### 3. Run

```bash
# Development (watch mode)
bun run dev

# Production
bun run start
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Service info + registered providers |
| `GET` | `/health` | Health check |
| `POST` | `/api/run` | **Generic** — run agent with any prompt |
| `POST` | `/webhook/sentry` | Sentry webhook → ClickUp (preset) |
| `POST` | `/api/process-issue` | Process a Sentry issue by ID (preset) |
| `GET` | `/api/mcp-tools` | List all MCP tools across providers |
| `GET` | `/api/providers` | List registered MCP providers |

## Client SDK Features

The TypeScript/JavaScript client provides:

- ✅ **Automatic retry logic** with exponential backoff (3 retries by default)
- ✅ **Request timeout handling** (2 minutes default, configurable)
- ✅ **Error normalization** with typed `MCPAgentError` exceptions
- ✅ **Debug logging** for troubleshooting
- ✅ **Type-safe interfaces** for all requests and responses
- ✅ **Promise-based async/await API**

## Usage

### Quick Start

1. **Start the server:**
   ```bash
   bun run dev
   ```

2. **Use the client in your code:**
   ```typescript
   import { MCPAgentClient } from "mcp-agent/client";

   const client = new MCPAgentClient({
     baseUrl: "http://localhost:3001",
   });

   // Process a Sentry issue
   const result = await client.processSentryIssue({
     issueId: "7290814283",
   });

   console.log(result.agent.summary);
   ```

3. **Or run the examples:**
   ```bash
   bun run examples/quick-start.ts
   ```

### TypeScript/JavaScript Client (Recommended)

```typescript
import { MCPAgentClient } from "mcp-agent/client";

const client = new MCPAgentClient({
  baseUrl: "http://localhost:3001",
  retries: 3,
  debug: true,
});

// Generic agent run
const result = await client.run({
  prompt: "Find all unresolved Sentry issues from the last 24h and create ClickUp tickets for the top 3"
});

console.log(result.agent.summary);
```

### Process a Sentry Issue

```typescript
const result = await client.processSentryIssue({
  issueId: "7290814283",
  organizationSlug: "saras-analytics"
});

console.log("Ticket created:", result.agent.summary);
```

### Advanced Usage

```typescript
// Custom system prompt and provider selection
const result = await client.run({
  prompt: "Analyze recent errors and suggest fixes",
  systemPrompt: "You are a senior DevOps engineer...",
  providers: ["sentry", "clickup"],
  maxRounds: 10,
  maxTokens: 8192
});

// Check service health
const health = await client.health();
console.log("Providers:", health.providers);

// List available tools
const { tools } = await client.listTools();
tools.forEach(t => console.log(`[${t.provider}] ${t.name}`));
```

See [`examples/client-usage.ts`](./examples/client-usage.ts) for more examples.

### REST API (Alternative)

If you prefer direct HTTP calls:

```bash
# Generic agent run
curl -X POST http://localhost:3001/api/run \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Find all unresolved Sentry issues from the last 24h and create ClickUp tickets for the top 3"}'

# Process a Sentry issue
curl -X POST http://localhost:3001/api/process-issue \
  -H "Content-Type: application/json" \
  -d '{"issueId": "12345"}'
```

### Set up Sentry webhook

1. Go to Sentry → Settings → Integrations → Internal Integrations
2. Create a new integration with webhook URL: `https://your-domain/webhook/sentry`
3. Enable the **Issue** alert

## Adding a New MCP Provider

1. **Via env vars** — add a new block in `buildMCPProviderConfigs()` in `src/config.ts`:

```ts
if (env.GITHUB_TOKEN) {
  configs.push({
    name: "github",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: env.GITHUB_TOKEN },
    enabled: true,
  });
}
```

2. **Programmatically** at runtime:

```ts
import { mcpRegistry } from "./mcp";

mcpRegistry.register({
  name: "my-custom-mcp",
  transport: "http",
  url: "https://my-mcp.example.com/mcp",
  headers: { Authorization: "Bearer ..." },
  toolPrefix: "custom_",
});
```

The agent will automatically discover and use tools from all registered providers.
