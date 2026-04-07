import { env } from "../config";
import { runAgent, type AgentResult } from "../llm/agent";
import { REPO_UUID_MAP } from "../repo-mapping";
import { preprocessSentryIssue, generateIssueHash, type MinimalSentryIssue } from "../utils/sentry-preprocessor";
import { deduplicationCache } from "../cache/deduplication-cache";
import { mcpRegistry } from "../mcp";
import { logger } from "../logger";

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
  let fullIssue: string;
  try {
    fullIssue = await mcpRegistry.executeTool("get_sentry_resource", {
      resourceType: "issue",
      resourceId: issueId,
      organizationSlug,
    });
  } catch (err) {
    logger.error("Failed to fetch Sentry issue", { issueId, organizationSlug, error: String(err) });
    throw new Error(`Failed to fetch Sentry issue ${issueId}: ${String(err)}`);
  }

  // Parse the response - handle JSON, markdown-wrapped JSON, or plain markdown
  let fullIssueData: any;
  
  // Check if response is markdown format (starts with # or contains markdown headers)
  if (fullIssue.startsWith("#") || fullIssue.includes("**Description**")) {
    // Handle plain markdown response from Sentry MCP
    // Extract key information from markdown format
    logger.info("Parsing markdown-formatted Sentry response", { issueId });
    
    const titleMatch = fullIssue.match(/^#\s+Issue\s+([^\s]+)/);
    const descMatch = fullIssue.match(/\*\*Description\*\*:\s*(.+?)(?:\n|$)/);
    const culpritMatch = fullIssue.match(/\*\*Culprit\*\*:\s*(.+?)(?:\n|$)/);
    
    const description = descMatch?.[1] || 'Unknown error';
    fullIssueData = {
      id: issueId,
      title: titleMatch?.[1] || `Issue ${issueId}`,
      metadata: {
        type: description.split(':')[0],
        value: description,
      },
      culprit: culpritMatch?.[1] || 'Unknown',
      shortId: titleMatch?.[1] || issueId,
      // Store the full markdown for context
      _markdownSource: fullIssue.slice(0, 1000),
    };
  } else {
    // Try direct JSON parse
    try {
      fullIssueData = JSON.parse(fullIssue);
    } catch (err) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = fullIssue.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          fullIssueData = JSON.parse(jsonMatch[1]);
        } catch (parseErr) {
          logger.error("Failed to parse JSON from markdown block", { 
            issueId, 
            error: String(parseErr),
            content: jsonMatch[1].slice(0, 200) 
          });
          throw new Error(`Invalid JSON in markdown block: ${String(parseErr)}`);
        }
      } else {
        // Log the actual response for debugging
        logger.error("Failed to parse Sentry response", { 
          issueId, 
          error: String(err),
          responsePreview: fullIssue.slice(0, 500) 
        });
        throw new Error(`Failed to parse Sentry response. Error: ${err}. Response preview: ${fullIssue.slice(0, 200)}`);
      }
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
  let ticketUrl: string | undefined;
  if (createTaskCall) {
    try {
      ticketUrl = JSON.parse(createTaskCall.result)?.url;
    } catch (err) {
      logger.warn("Failed to parse tool result as JSON", { 
        tool: createTaskCall.tool, 
        resultPreview: createTaskCall.result.slice(0, 200) 
      });
    }
  }

  deduplicationCache.store(hash, issueId, undefined, ticketUrl);

  return result;
}
