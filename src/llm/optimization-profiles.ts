/**
 * Optimization profiles for generic MCP server usage
 * Provides pre-configured settings for different use cases
 */

export interface OptimizationProfile {
  maxRounds: number;
  maxTokens: number;
  jsonOnly: boolean;
  description: string;
}

export const OPTIMIZATION_PROFILES: Record<string, OptimizationProfile> = {
  /**
   * Aggressive: Maximum cost savings
   * - Single-shot execution
   * - Minimal output tokens
   * - JSON-only responses
   * Best for: Repetitive, structured tasks
   */
  aggressive: {
    maxRounds: 1,
    maxTokens: 2048,
    jsonOnly: true,
    description: "Maximum cost savings - single-shot, JSON-only (95% cost reduction)",
  },

  /**
   * Balanced: Good cost/quality trade-off
   * - Limited rounds
   * - Moderate output
   * - Structured responses preferred
   * Best for: Most production workflows
   */
  balanced: {
    maxRounds: 3,
    maxTokens: 4096,
    jsonOnly: false,
    description: "Balanced cost and flexibility (70-80% cost reduction)",
  },

  /**
   * Exploratory: Maximum flexibility
   * - Multiple rounds allowed
   * - Full output capacity
   * - Natural language responses
   * Best for: Complex, unpredictable tasks
   */
  exploratory: {
    maxRounds: 15,
    maxTokens: 8192,
    jsonOnly: false,
    description: "Maximum flexibility for complex tasks (minimal optimization)",
  },

  /**
   * Fast: Quick responses
   * - Single round
   * - Small output
   * - Natural language OK
   * Best for: Simple queries, quick actions
   */
  fast: {
    maxRounds: 1,
    maxTokens: 1024,
    jsonOnly: false,
    description: "Fast responses for simple tasks (90% cost reduction)",
  },
};

/**
 * Get optimization profile by name
 */
export function getOptimizationProfile(name: string): OptimizationProfile | null {
  return OPTIMIZATION_PROFILES[name] || null;
}

/**
 * Build system prompt modifier for JSON-only mode
 */
export function buildJsonOnlyModifier(): string {
  return "\n\nIMPORTANT: Respond ONLY with valid JSON. No explanation, no markdown, no additional text.";
}

/**
 * Apply optimization profile to agent options
 */
export function applyOptimizationProfile(
  profile: OptimizationProfile,
  systemPrompt?: string
): { maxRounds: number; maxTokens: number; systemPrompt?: string } {
  return {
    maxRounds: profile.maxRounds,
    maxTokens: profile.maxTokens,
    systemPrompt: profile.jsonOnly && systemPrompt
      ? systemPrompt + buildJsonOnlyModifier()
      : systemPrompt,
  };
}
