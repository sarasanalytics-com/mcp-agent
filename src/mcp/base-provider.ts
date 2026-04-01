import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../logger";
import type { MCPProvider, MCPProviderConfig } from "./types";

/**
 * Generic MCP provider that can connect to any MCP server
 * via stdio or HTTP transport. Handles tool discovery, execution,
 * retry logic, and connection lifecycle.
 */
export class BaseMCPProvider implements MCPProvider {
  readonly name: string;
  readonly config: MCPProviderConfig;

  private client: Client | null = null;
  private cachedTools: MCPTool[] | null = null;
  private cachedAt = 0;
  private retries: number;
  private timeoutMs: number;
  private cacheTtlMs: number;

  constructor(config: MCPProviderConfig, opts?: { retries?: number; timeoutMs?: number; cacheTtlMs?: number }) {
    this.name = config.name;
    this.config = config;
    this.retries = opts?.retries ?? 2;
    this.timeoutMs = opts?.timeoutMs ?? 60000;
    this.cacheTtlMs = opts?.cacheTtlMs ?? 0; // 0 = cache forever
  }

  /** Force a fresh connection (used for reconnection after errors) */
  private async reconnect(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch { /* ignore close errors */ }
      this.client = null;
    }
    await this.connect();
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.client = new Client({ name: `mcp-agent-${this.name}`, version: "1.0.0" });

    if (this.config.transport === "stdio") {
      if (!this.config.command) throw new Error(`[${this.name}] stdio transport requires 'command'`);
      const transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args ?? [],
        env: this.config.env ? { ...process.env, ...this.config.env } as Record<string, string> : undefined,
      });
      await this.client.connect(transport);
    } else if (this.config.transport === "http") {
      if (!this.config.url) throw new Error(`[${this.name}] http transport requires 'url'`);
      const transport = new StreamableHTTPClientTransport(
        new URL(this.config.url),
        this.config.headers
          ? { requestInit: { headers: this.config.headers } }
          : undefined,
      );
      await this.client.connect(transport);
    } else {
      throw new Error(`[${this.name}] Unknown transport: ${this.config.transport}`);
    }

    logger.info(`Connected to MCP server: ${this.name}`);
  }

  async discoverTools(): Promise<MCPTool[]> {
    const cacheValid = this.cachedTools && (this.cacheTtlMs === 0 || Date.now() - this.cachedAt < this.cacheTtlMs);
    if (cacheValid) return this.cachedTools!;

    await this.connect();
    const { tools } = await this.client!.listTools();
    this.cachedTools = tools;
    this.cachedAt = Date.now();

    logger.info(`Discovered tools from ${this.name}`, {
      count: tools.length,
      names: tools.map((t) => t.name),
    });

    return tools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.connect();

    // Inject any default args from metadata
    const enrichedArgs = { ...args };
    if (this.config.metadata) {
      for (const [key, value] of Object.entries(this.config.metadata)) {
        if (key.startsWith("default_arg_") && !(key.replace("default_arg_", "") in enrichedArgs)) {
          enrichedArgs[key.replace("default_arg_", "")] = value;
        }
      }
    }

    logger.info(`Executing tool on ${this.name}`, { tool: name, args: enrichedArgs });

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`MCP call timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        });

        const result = await Promise.race([
          this.client!.callTool({ name, arguments: enrichedArgs }),
          timeoutPromise,
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        const content = result.content as Array<{ type: string; text?: string }> | undefined;
        const text = (content ?? [])
          .filter((c): c is { type: string; text: string } => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n");

        logger.info(`Tool result from ${this.name}`, {
          tool: name,
          attempt: attempt + 1,
          responseLength: text.length,
          preview: text.slice(0, 300),
        });

        return text;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);

        const isLastAttempt = attempt === this.retries;
        const isConnectionError = err instanceof Error && (
          err.message.includes("timed out") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("EPIPE") ||
          err.message.includes("closed")
        );

        logger.warn(`Tool attempt failed on ${this.name}`, {
          tool: name,
          attempt: attempt + 1,
          isConnectionError,
          error: String(err),
        });

        // Reconnect on connection-related errors before retrying
        if (isConnectionError && !isLastAttempt) {
          try { await this.reconnect(); } catch (reconnectErr) {
            logger.warn(`Reconnect failed on ${this.name}`, { error: String(reconnectErr) });
          }
        }

        if (isLastAttempt) {
          logger.error(`Tool failed after all retries on ${this.name}`, { tool: name, error: String(err) });
          throw err;
        }

        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error("Unreachable");
  }

  canHandle(toolName: string): boolean {
    if (this.config.toolPrefix) {
      return toolName.startsWith(this.config.toolPrefix);
    }
    // If no prefix defined, check against cached tool names
    if (this.cachedTools) {
      return this.cachedTools.some((t) => t.name === toolName);
    }
    // Tools not yet discovered — cannot determine ownership
    logger.warn(`canHandle called before tool discovery on ${this.name}`, { toolName });
    return false;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.cachedTools = null;
      logger.info(`Disconnected from MCP server: ${this.name}`);
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
