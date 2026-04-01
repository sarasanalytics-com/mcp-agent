import Anthropic from "@anthropic-ai/sdk";
import type { Tool as AnthropicTool, MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config";
import { logger } from "../logger";
import { mcpRegistry } from "../mcp";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AgentResult {
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  summary: string;
  usage: TokenUsage;
  rounds: number;
}

export interface RunAgentOptions {
  /** The user prompt describing what the agent should do */
  prompt: string;

  /** Optional system prompt to set agent behavior/persona */
  systemPrompt?: string;

  /** Max agentic tool-call rounds (defaults to env.AGENT_MAX_TOOL_ROUNDS) */
  maxRounds?: number;

  /** Max tokens for LLM response (defaults to 4096) */
  maxTokens?: number;

  /** Optional subset of provider names to use (defaults to all registered) */
  providers?: string[];
}

/** Convert MCP tool schemas → Anthropic tool definitions */
function mcpToolsToAnthropic(mcpTools: MCPTool[]): AnthropicTool[] {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description || "",
    input_schema: (t.inputSchema as AnthropicTool["input_schema"]) || {
      type: "object" as const,
      properties: {},
    },
  }));
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI agent with access to external tools via MCP (Model Context Protocol) servers.

Use the available tools to accomplish the user's request. Be thorough:
- Gather information first before taking actions
- Analyze data carefully before making decisions
- Provide a clear summary of what you did when finished

If you're unsure which tool to use, describe what you're trying to do and use the most relevant tool available.`;

/**
 * Generic agentic loop: takes a user prompt, discovers tools from the MCP registry,
 * and runs an Anthropic tool-use loop until the task is complete.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const maxRounds = opts.maxRounds ?? env.AGENT_MAX_TOOL_ROUNDS;
  const maxTokens = opts.maxTokens ?? 4096;
  const systemPrompt = opts.systemPrompt || env.DEFAULT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

  // 1. Discover tools from all (or selected) MCP providers
  const { tools: mcpTools, byProvider } = await mcpRegistry.discoverAllTools();

  // If specific providers requested, filter tools
  let filteredTools = mcpTools;
  if (opts.providers?.length) {
    const allowedProviders = new Set(opts.providers);
    filteredTools = Object.entries(byProvider)
      .filter(([name]) => allowedProviders.has(name))
      .flatMap(([, tools]) => tools);
  }

  const tools = mcpToolsToAnthropic(filteredTools);

  logger.info("Agent starting", {
    promptPreview: opts.prompt.slice(0, 200),
    providers: opts.providers ?? mcpRegistry.getProviderNames(),
    totalTools: tools.length,
    maxRounds,
    model: env.ANTHROPIC_MODEL,
  });

  // 2. Build initial messages
  const messages: MessageParam[] = [
    { role: "user", content: opts.prompt },
  ];

  const toolCallLog: AgentResult["toolCalls"] = [];
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  // 3. Agentic loop
  for (let round = 0; round < maxRounds; round++) {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools,
      messages,
    });

    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;

    logger.info("Agent response", {
      round,
      stopReason: response.stop_reason,
      contentBlocks: response.content.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // If the model is done (no more tool calls), extract final text
    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      const textBlock = response.content.find((b) => b.type === "text");
      const truncated = response.stop_reason === "max_tokens";
      if (truncated) {
        logger.warn("Agent response truncated (max_tokens reached)", { round, maxTokens });
      }
      return {
        toolCalls: toolCallLog,
        summary: (textBlock && "text" in textBlock ? textBlock.text : "Task completed.") +
          (truncated ? "\n\n⚠️ Response was truncated due to token limit." : ""),
        usage: totalUsage,
        rounds: round + 1,
      };
    }

    // Process tool_use blocks
    if (response.stop_reason === "tool_use") {
      // Add assistant message to conversation
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

      logger.info("Agent executing tools", {
        round,
        toolCount: toolUseBlocks.length,
        tools: toolUseBlocks.map((b) => b.type === "tool_use" ? b.name : ""),
      });

      // Execute all tool calls in parallel for speed
      const settled = await Promise.allSettled(
        toolUseBlocks.map(async (block) => {
          if (block.type !== "tool_use") return null;

          logger.info("Agent calling MCP tool", {
            round,
            tool: block.name,
            args: block.input,
          });

          const result = await mcpRegistry.executeTool(
            block.name,
            block.input as Record<string, unknown>
          );

          return { block, result };
        })
      );

      // Collect results in the same order as the blocks
      const toolResults: ToolResultBlockParam[] = [];

      for (const outcome of settled) {
        if (outcome.status === "fulfilled" && outcome.value) {
          const { block, result } = outcome.value;
          if (block.type !== "tool_use") continue;

          toolCallLog.push({
            tool: block.name,
            args: block.input as Record<string, unknown>,
            result,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } else if (outcome.status === "rejected") {
          // Find the matching block by index
          const idx = settled.indexOf(outcome);
          const block = toolUseBlocks[idx];
          if (!block || block.type !== "tool_use") continue;

          const errorMsg = `Tool execution failed: ${String(outcome.reason)}`;
          logger.error("MCP tool failed", { tool: block.name, error: String(outcome.reason) });

          toolCallLog.push({
            tool: block.name,
            args: block.input as Record<string, unknown>,
            result: errorMsg,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: errorMsg,
            is_error: true,
          });
        }
      }

      // Feed tool results back to the model
      messages.push({ role: "user", content: toolResults });
    }
  }

  logger.warn("Agent hit max rounds", { rounds: maxRounds, usage: totalUsage });
  return {
    toolCalls: toolCallLog,
    summary: "Agent completed (max rounds reached).",
    usage: totalUsage,
    rounds: maxRounds,
  };
}
