import { MCPAgentClient } from "../src/client";

// Initialize the client
const client = new MCPAgentClient({
  baseUrl: "http://localhost:3001",
  timeout: 120000,
  retries: 3,
  debug: true,
});

// Example 1: Generic agent run
async function runGenericAgent() {
  try {
    const result = await client.run({
      prompt: "Find all unresolved Sentry issues from the last 24h and create ClickUp tickets for the top 3",
    });

    console.log("Agent completed:", result.agent.summary);
    console.log("Duration:", result.durationMs, "ms");
    console.log("Tool calls:", result.agent.toolCalls.length);
  } catch (err) {
    console.error("Agent run failed:", err);
  }
}

// Example 2: Process a specific Sentry issue
async function processSentryIssue() {
  try {
    const result = await client.processSentryIssue({
      issueId: "7290814283",
      organizationSlug: "saras-analytics",
    });

    console.log("Ticket created:", result.agent.summary);
  } catch (err) {
    console.error("Failed to process issue:", err);
  }
}

// Example 3: Custom prompt with specific providers
async function customAgentRun() {
  try {
    const result = await client.run({
      prompt: "Search for high-priority issues in Sentry and summarize them",
      systemPrompt: "You are a DevOps triage assistant. Be concise and actionable.",
      providers: ["sentry"], // Only use Sentry tools
      maxRounds: 5,
    });

    console.log(result.agent.summary);
  } catch (err) {
    console.error("Custom run failed:", err);
  }
}

// Example 4: Health check and service info
async function checkServiceStatus() {
  try {
    const health = await client.health();
    console.log("Service status:", health.status);
    console.log("Providers:", health.providers);

    const info = await client.info();
    console.log("Service version:", info.version);
    console.log("Available endpoints:", info.endpoints);
  } catch (err) {
    console.error("Health check failed:", err);
  }
}

// Example 5: List available tools
async function listAvailableTools() {
  try {
    const { tools } = await client.listTools();
    console.log(`Found ${tools.length} tools:`);
    
    for (const tool of tools) {
      console.log(`- [${tool.provider}] ${tool.name}: ${tool.description}`);
    }
  } catch (err) {
    console.error("Failed to list tools:", err);
  }
}

// Run examples
(async () => {
  await checkServiceStatus();
  await listAvailableTools();
  await processSentryIssue();
})();
