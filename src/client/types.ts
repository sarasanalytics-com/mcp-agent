/** Client configuration */
export interface MCPAgentClientConfig {
  /** Base URL of the MCP agent server */
  baseUrl: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Number of retry attempts for failed requests */
  retries?: number;

  /** API key for authentication (sent as X-Api-Key header) */
  apiKey?: string;

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;

  /** Enable debug logging */
  debug?: boolean;
}

/** Generic agent run request */
export interface RunAgentRequest {
  /** The user prompt describing what the agent should do */
  prompt: string;

  /** Optional system prompt to set agent behavior/persona */
  systemPrompt?: string;

  /** Optional subset of provider names to use */
  providers?: string[];

  /** Max agentic tool-call rounds */
  maxRounds?: number;

  /** Max tokens for LLM response */
  maxTokens?: number;
}

/** Token usage from LLM */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Agent execution result */
export interface AgentResult {
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  summary: string;
  usage: TokenUsage;
  rounds: number;
}

/** Pipeline result with timing */
export interface PipelineResult {
  agent: AgentResult;
  durationMs: number;
}

/** Process Sentry issue request */
export interface ProcessIssueRequest {
  issueId: string;
  organizationSlug?: string;
}

/** Health check response */
export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  providers: string[];
}

/** MCP tool info */
export interface MCPToolInfo {
  provider: string;
  name: string;
  description?: string;
}

/** Service info response */
export interface ServiceInfo {
  name: string;
  version: string;
  providers: string[];
  endpoints: Record<string, string>;
}

/** Normalized error response */
export class MCPAgentError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "MCPAgentError";
  }
}
