import { env } from "../config";
import { runAgent, type AgentResult } from "../llm/agent";
import { REPO_UUID_MAP } from "../repo-mapping";
import { preprocessSentryIssue, generateIssueHash, type MinimalSentryIssue } from "../utils/sentry-preprocessor";
import { deduplicationCache } from "../cache/deduplication-cache";
import { mcpRegistry } from "../mcp";

/**
 * Preset: Sentry → ClickUp triage pipeline.
 * Builds the domain-specific system prompt and user prompt,
 * then delegates to the generic agent.
 */

function buildSystemPrompt(): string {
  return `Create ClickUp ticket from Sentry error data. Respond ONLY with JSON.

**Output Format** (JSON only, no explanation):
\`\`\`json
{
  "title": "ErrorType in Component - brief description",
  "description": "markdown content with sections below",
  "priority": "urgent|high|normal|low",
  "tags": ["sentry", "bug", "error_type", "area"],
  "repositoryUuid": "uuid-from-mapping"
}
\`\`\`

**Description Structure**:
- 🔴 **What's Broken**: User impact, error
- 📊 **Metrics**: {occurrences} events, {userCount} users, {firstSeen} to {lastSeen}
- 🌍 **Environment**: {project}, {environment}, {browser}, {os}
- 🔍 **Root Cause**: Analyze top stack frame
- 📝 **Stack**: Top frames in code block
- 🔄 **Journey**: Last user actions from breadcrumbs
- 💡 **Fix**: Actionable recommendation
- 🔗 **Links**: Sentry URL${env.CLICKUP_LIST_ID ? `, replay if available` : ""}

**Priority**: urgent (>50 users/500 events), high (>10/100), normal (<100), low (edge)

**Repository Mapping**:
${JSON.stringify(Object.entries(REPO_UUID_MAP).map(([k, u]) => [k, u]), null, 2)}
Rules: daton*/webapp→daton-webapp, saras-iq-*→iq-webapp, insights→insights-webapp, global→global-accounts-webapp`;
}

function buildUserPrompt(issue: MinimalSentryIssue): string {
  return `Create ClickUp ticket. Respond with JSON only.

**Issue Data**:
\`\`\`json
${JSON.stringify(issue, null, 2)}
\`\`\`

**Actions**:
1. Get custom field ID: \`clickup_get_custom_fields\` (list_id="${env.CLICKUP_LIST_ID}")
2. Map project "${issue.project}" → repository UUID
3. Create ticket: \`clickup_create_task\` with title, markdown_description, priority, tags, custom_fields=[{id: repo_field_id, value: repo_uuid}]
4. Add tags: \`clickup_add_tag_to_task\`

Respond ONLY with final JSON (no explanation).`;
}

/** Run the Sentry→ClickUp triage preset with advanced optimizations */
export async function runSentryClickUpPreset(
  issueId: string,
  organizationSlug = "saras-analytics"
): Promise<AgentResult> {
  // Step 1: Fetch full Sentry issue data
  const fullIssue = await mcpRegistry.executeTool("get_sentry_resource", {
    resourceType: "issue",
    resourceId: issueId,
    organizationSlug,
  });

  // Parse the response - handle both JSON and markdown-wrapped JSON
  let fullIssueData: any;
  try {
    // Try direct JSON parse first
    fullIssueData = JSON.parse(fullIssue);
  } catch (err) {
    // If that fails, try to extract JSON from markdown code blocks
    const jsonMatch = fullIssue.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      fullIssueData = JSON.parse(jsonMatch[1]);
    } else {
      // Log the actual response for debugging
      throw new Error(`Failed to parse Sentry response. Error: ${err}. Response preview: ${fullIssue.slice(0, 200)}`);
    }
  }

  // Step 2: Pre-process to minimal payload (60-80% reduction)
  const minimalIssue = preprocessSentryIssue(fullIssueData);

  // Step 3: Check deduplication cache
  const hash = generateIssueHash(minimalIssue);
  const cached = deduplicationCache.check(hash, issueId);

  if (cached) {
    // Skip LLM call entirely - return cached result
    return {
      toolCalls: [],
      summary: cached.ticketUrl
        ? `Skipped: Similar issue already processed. Existing ticket: ${cached.ticketUrl}`
        : `Skipped: Issue ${cached.issueId} processed ${Math.round((Date.now() - cached.processedAt) / 60000)}min ago`,
      usage: { inputTokens: 0, outputTokens: 0 },
      rounds: 0,
    };
  }

  // Step 4: Run LLM in single-shot mode (maxRounds=1)
  const result = await runAgent({
    prompt: buildUserPrompt(minimalIssue),
    systemPrompt: buildSystemPrompt(),
    providers: ["clickup"],
    maxTokens: 2048, // Reduced further for JSON-only output
    maxRounds: 1, // SINGLE-SHOT MODE - no multi-round
    allowedTools: [
      "clickup_create_task",
      "clickup_get_custom_fields",
      "clickup_add_tag_to_task",
    ],
  });

  // Step 5: Store in deduplication cache
  // Extract ticket URL from tool calls if available
  const createTaskCall = result.toolCalls.find((tc) => tc.tool === "clickup_create_task");
  const ticketUrl = createTaskCall ? JSON.parse(createTaskCall.result)?.url : undefined;

  deduplicationCache.store(hash, issueId, undefined, ticketUrl);

  return result;
}
