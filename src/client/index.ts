import type {
  MCPAgentClientConfig,
  RunAgentRequest,
  PipelineResult,
  ProcessIssueRequest,
  HealthResponse,
  MCPToolInfo,
  ServiceInfo,
} from "./types";
import { MCPAgentError } from "./types";

/**
 * TypeScript/JavaScript client for the MCP Agent API.
 * Provides retry logic, error normalization, and type-safe interfaces.
 */
export class MCPAgentClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private headers: Record<string, string>;
  private debug: boolean;

  constructor(config: MCPAgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 120000; // 2 minutes default
    this.retries = config.retries ?? 3;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}),
      ...config.headers,
    };
    this.debug = config.debug ?? false;
  }

  private log(message: string, data?: unknown): void {
    if (this.debug) {
      console.log(`[MCPAgentClient] ${message}`, data ?? "");
    }
  }

  private async fetchWithRetry<T>(
    path: string,
    options: RequestInit = {},
    attempt = 1
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      this.log(`Request [${attempt}/${this.retries + 1}]`, { url, method: options.method ?? "GET" });

      const response = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        let errorData: unknown;
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          errorData = errorBody;
        }

        throw new MCPAgentError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      this.log("Response received", { status: response.status });
      return data as T;
    } catch (err) {
      clearTimeout(timeoutId);

      const isLastAttempt = attempt > this.retries;
      const isAbortError = err instanceof Error && err.name === "AbortError";
      const isNetworkError = err instanceof TypeError;
      const shouldRetry = !isLastAttempt && (isAbortError || isNetworkError);

      if (shouldRetry) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        this.log(`Retrying after ${backoffMs}ms`, { attempt, error: String(err) });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.fetchWithRetry<T>(path, options, attempt + 1);
      }

      // Normalize error
      if (err instanceof Error && "statusCode" in err) {
        throw err; // Already an MCPAgentError
      }

      if (isAbortError) {
        throw new MCPAgentError(`Request timeout after ${this.timeout}ms`);
      }

      throw new MCPAgentError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Run the agent with a custom prompt (generic endpoint)
   */
  async run(request: RunAgentRequest): Promise<PipelineResult> {
    return this.fetchWithRetry<PipelineResult>("/api/run", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Process a Sentry issue and create a ClickUp ticket (preset)
   */
  async processSentryIssue(request: ProcessIssueRequest): Promise<PipelineResult> {
    return this.fetchWithRetry<PipelineResult>("/api/process-issue", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get service health status
   */
  async health(): Promise<HealthResponse> {
    return this.fetchWithRetry<HealthResponse>("/health");
  }

  /**
   * Get service information
   */
  async info(): Promise<ServiceInfo> {
    return this.fetchWithRetry<ServiceInfo>("/");
  }

  /**
   * List all available MCP tools across providers
   */
  async listTools(): Promise<{ count: number; tools: MCPToolInfo[] }> {
    return this.fetchWithRetry<{ count: number; tools: MCPToolInfo[] }>("/api/mcp-tools");
  }

  /**
   * List registered MCP providers
   */
  async listProviders(): Promise<{ providers: string[] }> {
    return this.fetchWithRetry<{ providers: string[] }>("/api/providers");
  }
}

export * from "./types";
export { MCPAgentError } from "./types";
