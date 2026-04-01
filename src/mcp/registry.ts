import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config";
import { logger } from "../logger";
import { BaseMCPProvider } from "./base-provider";
import type { MCPProvider, MCPProviderConfig } from "./types";

/**
 * Central registry for all MCP providers.
 * Handles registration, tool discovery across providers, and routing tool calls.
 */
class MCPRegistry {
  private providers: Map<string, MCPProvider> = new Map();
  private toolIndex: Map<string, MCPProvider> = new Map();
  private toolsDiscovered = false;

  /** Register a provider from config. Returns null if the provider is disabled. */
  register(config: MCPProviderConfig): MCPProvider | null {
    if (config.enabled === false) {
      logger.info(`Skipping disabled MCP provider: ${config.name}`);
      return null;
    }

    const provider = new BaseMCPProvider(config, {
      cacheTtlMs: env.TOOL_CACHE_TTL_MS,
    });
    this.providers.set(config.name, provider);
    logger.info(`Registered MCP provider: ${config.name}`);
    return provider;
  }

  /** Register a custom provider instance (for advanced use cases) */
  registerInstance(provider: MCPProvider): void {
    this.providers.set(provider.name, provider);
    logger.info(`Registered custom MCP provider: ${provider.name}`);
  }

  /** Get a specific provider by name */
  get(name: string): MCPProvider | undefined {
    return this.providers.get(name);
  }

  /** Get all registered provider names */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Discover tools from all registered providers */
  async discoverAllTools(): Promise<{ tools: MCPTool[]; byProvider: Record<string, MCPTool[]> }> {
    const byProvider: Record<string, MCPTool[]> = {};
    const allTools: MCPTool[] = [];

    const entries = Array.from(this.providers.entries());
    const results = await Promise.all(
      entries.map(async ([name, provider]) => {
        try {
          const tools = await provider.discoverTools();
          return { name, tools };
        } catch (err) {
          logger.error(`Failed to discover tools from ${name}`, { error: String(err) });
          return { name, tools: [] as MCPTool[] };
        }
      })
    );

    for (const { name, tools } of results) {
      byProvider[name] = tools;
      allTools.push(...tools);
      const provider = this.providers.get(name);
      if (provider) {
        for (const tool of tools) {
          this.toolIndex.set(tool.name, provider);
        }
      }
    }

    this.toolsDiscovered = true;

    logger.info("Discovered all MCP tools", {
      totalTools: allTools.length,
      providers: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, v.length])),
    });

    return { tools: allTools, byProvider };
  }

  /** Route a tool call to the correct provider and execute it */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    // Ensure tools have been discovered so canHandle() works for all providers
    if (!this.toolsDiscovered) {
      await this.discoverAllTools();
    }

    // O(1) lookup via tool index
    const indexed = this.toolIndex.get(toolName);
    if (indexed) {
      return indexed.executeTool(toolName, args);
    }

    // Fallback: linear scan (handles tools registered after discovery)
    for (const provider of this.providers.values()) {
      if (provider.canHandle(toolName)) {
        this.toolIndex.set(toolName, provider); // cache for next time
        return provider.executeTool(toolName, args);
      }
    }

    throw new Error(`No MCP provider found for tool: ${toolName}`);
  }

  /** Disconnect all providers */
  async disconnectAll(): Promise<void> {
    const entries = Array.from(this.providers.values());
    await Promise.all(entries.map((p) => p.disconnect().catch((err) =>
      logger.error(`Error disconnecting ${p.name}`, { error: String(err) })
    )));
    logger.info("All MCP providers disconnected");
  }

  /** List all tools across all providers (for debugging/API) */
  async listAllTools(): Promise<Array<{ provider: string; name: string; description?: string }>> {
    const { byProvider } = await this.discoverAllTools();
    const result: Array<{ provider: string; name: string; description?: string }> = [];

    for (const [providerName, tools] of Object.entries(byProvider)) {
      for (const tool of tools) {
        result.push({ provider: providerName, name: tool.name, description: tool.description });
      }
    }

    return result;
  }
}

/** Singleton registry */
export const mcpRegistry = new MCPRegistry();
