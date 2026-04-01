import { runAgent, type AgentResult, type RunAgentOptions } from "./llm/agent";
import { logger } from "./logger";

export interface PipelineResult {
  agent: AgentResult;
  durationMs: number;
}

/**
 * Generic pipeline: run the agent with any prompt and optional configuration.
 * This is the single entry point for all agent executions.
 */
export async function runPipeline(opts: RunAgentOptions): Promise<PipelineResult> {
  const start = Date.now();
  logger.info("Pipeline started", { promptPreview: opts.prompt.slice(0, 200) });

  const agent = await runAgent(opts);

  const durationMs = Date.now() - start;
  logger.info("Pipeline complete", {
    toolCalls: agent.toolCalls.length,
    durationMs,
    summary: agent.summary.slice(0, 200),
  });

  return { agent, durationMs };
}
