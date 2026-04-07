import { z } from "zod";
import type { MCPProviderConfig } from "./mcp/types";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),

  // LLM Provider Selection
  LLM_PROVIDER: z.enum(["anthropic", "openai"]).optional().default("anthropic"),
  
  // Anthropic (LLM)
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-haiku-20241022"),
  
  // OpenAI (LLM)
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  
  AGENT_MAX_TOOL_ROUNDS: z.coerce.number().default(15),

  // Default system prompt (optional — can be overridden per request)
  DEFAULT_SYSTEM_PROMPT: z.string().optional().default(""),

  // API authentication (optional — if set, all non-health endpoints require this key)
  API_KEY: z.string().optional().default(""),

  // ── Optional built-in MCP providers (backward-compat env vars) ──

  // Sentry
  SENTRY_AUTH_TOKEN: z.string().optional().default(""),
  SENTRY_ORG_SLUG: z.string().optional().default(""),
  SENTRY_PROJECT_SLUG: z.string().optional().default(""),
  SENTRY_WEBHOOK_SECRET: z.string().optional().default(""),

  // ClickUp
  CLICKUP_MCP_URL: z.string().url().optional().default("https://mcp.clickup.com/mcp"),
  CLICKUP_API_TOKEN: z.string().optional().default(""),
  CLICKUP_WORKSPACE_ID: z.string().optional().default(""),
  CLICKUP_LIST_ID: z.string().optional().default(""),

  // Tool cache TTL in milliseconds (0 = cache forever, default)
  TOOL_CACHE_TTL_MS: z.coerce.number().optional().default(0),

  // Rate limiting configuration
  CLICKUP_MAX_REQUESTS_PER_MINUTE: z.coerce.number().optional().default(50),
  CLICKUP_MAX_REQUESTS_PER_HOUR: z.coerce.number().optional().default(1000),
  CLICKUP_MAX_CONCURRENT_REQUESTS: z.coerce.number().optional().default(5),

  // Cache TTL configuration (in milliseconds)
  CACHE_TTL_WORKSPACE_HIERARCHY: z.coerce.number().optional().default(30 * 60 * 1000),
  CACHE_TTL_WORKSPACE_MEMBERS: z.coerce.number().optional().default(60 * 60 * 1000),
  CACHE_TTL_LIST_DETAILS: z.coerce.number().optional().default(30 * 60 * 1000),
  CACHE_TTL_CUSTOM_FIELDS: z.coerce.number().optional().default(60 * 60 * 1000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const data = result.data;

  // Validate that the selected provider has an API key
  if (data.LLM_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) {
    console.error("❌ LLM_PROVIDER is set to 'anthropic' but ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  if (data.LLM_PROVIDER === "openai" && !data.OPENAI_API_KEY) {
    console.error("❌ LLM_PROVIDER is set to 'openai' but OPENAI_API_KEY is not set");
    process.exit(1);
  }

  return data;
}

export const env = loadEnv();

/**
 * Build MCP provider configs from environment variables.
 * Each provider is only enabled if its required env vars are set.
 * Additional providers can be registered programmatically.
 */
export function buildMCPProviderConfigs(): MCPProviderConfig[] {
  const configs: MCPProviderConfig[] = [];

  // Sentry — stdio transport via npx
  if (env.SENTRY_AUTH_TOKEN) {
    configs.push({
      name: "sentry",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@sentry/mcp-server"],
      env: { SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN },
      enabled: true,
      metadata: {
        orgSlug: env.SENTRY_ORG_SLUG,
        projectSlug: env.SENTRY_PROJECT_SLUG,
      },
    });
  }

  // ClickUp — HTTP transport
  if (env.CLICKUP_API_TOKEN) {
    configs.push({
      name: "clickup",
      transport: "http",
      url: env.CLICKUP_MCP_URL,
      headers: { Authorization: `Bearer ${env.CLICKUP_API_TOKEN}` },
      toolPrefix: "clickup_",
      enabled: true,
      metadata: {
        default_arg_workspace_id: env.CLICKUP_WORKSPACE_ID,
        listId: env.CLICKUP_LIST_ID,
      },
    });
  }

  return configs;
}
