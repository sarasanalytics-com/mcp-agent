import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";

/** Transport type for connecting to an MCP server */
export type MCPTransportType = "stdio" | "http";

/** Configuration for an MCP provider */
export interface MCPProviderConfig {
  /** Unique name for this provider (e.g. "sentry", "clickup", "github") */
  name: string;

  /** Transport type */
  transport: MCPTransportType;

  /** For stdio transport: the command to run */
  command?: string;

  /** For stdio transport: arguments to pass to the command */
  args?: string[];

  /** For stdio transport: environment variables to pass to the process */
  env?: Record<string, string>;

  /** For http transport: the URL of the MCP server */
  url?: string;

  /** For http transport: headers to include in requests */
  headers?: Record<string, string>;

  /** Tool name prefix used to route tool calls (e.g. "clickup_") */
  toolPrefix?: string;

  /** Whether this provider is enabled */
  enabled?: boolean;

  /** Extra provider-specific metadata (e.g. workspace IDs, default args) */
  metadata?: Record<string, unknown>;
}

/** A connected MCP provider that can discover and execute tools */
export interface MCPProvider {
  /** Provider name */
  readonly name: string;

  /** Provider config */
  readonly config: MCPProviderConfig;

  /** Connect to the MCP server */
  connect(): Promise<void>;

  /** Discover available tools */
  discoverTools(): Promise<MCPTool[]>;

  /** Execute a tool by name with given arguments */
  executeTool(name: string, args: Record<string, unknown>): Promise<string>;

  /** Check if this provider handles a given tool name */
  canHandle(toolName: string): boolean;

  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;

  /** Whether the provider is currently connected */
  isConnected(): boolean;
}
