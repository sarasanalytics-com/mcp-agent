/**
 * Quick Start Guide: Using the MCP Agent Client
 * 
 * This file shows the most common use cases with copy-paste ready examples.
 */

import { MCPAgentClient } from "../src/client";

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Initialize the client
// ═══════════════════════════════════════════════════════════════════════════

const client = new MCPAgentClient({
  baseUrl: "http://localhost:3001",  // Your server URL
  retries: 3,                         // Retry failed requests 3 times
  timeout: 120000,                    // 2 minute timeout
  debug: true,                        // Enable logging (optional)
});

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Process a Sentry issue → Create ClickUp ticket
// ═══════════════════════════════════════════════════════════════════════════

async function example1_ProcessSentryIssue() {
  console.log("\n📋 Example 1: Process Sentry Issue\n");
  
  try {
    const result = await client.processSentryIssue({
      issueId: "7290814283",                    // Your Sentry issue ID
      organizationSlug: "saras-analytics",      // Optional: defaults from env
    });

    console.log("✅ Success!");
    console.log("Summary:", result.agent.summary);
    console.log("Duration:", result.durationMs, "ms");
    console.log("Tools used:", result.agent.toolCalls.length);
    
    // Extract ClickUp ticket URL from tool calls
    const clickupCall = result.agent.toolCalls.find(
      tc => tc.tool === "clickup_create_task"
    );
    if (clickupCall) {
      const ticketData = JSON.parse(clickupCall.result);
      console.log("🎫 Ticket URL:", ticketData.task_url);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Generic agent run with custom prompt
// ═══════════════════════════════════════════════════════════════════════════

async function example2_GenericAgentRun() {
  console.log("\n🤖 Example 2: Generic Agent Run\n");
  
  try {
    const result = await client.run({
      prompt: "Find all unresolved Sentry issues from the last 24h and create ClickUp tickets for the top 3 by user impact",
    });

    console.log("✅ Agent completed!");
    console.log(result.agent.summary);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Custom system prompt + provider selection
// ═══════════════════════════════════════════════════════════════════════════

async function example3_CustomPromptAndProviders() {
  console.log("\n⚙️  Example 3: Custom Configuration\n");
  
  try {
    const result = await client.run({
      prompt: "Search for critical errors in production and summarize them",
      
      // Custom system prompt to change agent behavior
      systemPrompt: `You are a senior DevOps engineer. Be concise and focus on:
        1. Root cause analysis
        2. Impact assessment
        3. Immediate action items`,
      
      // Only use Sentry tools (no ClickUp)
      providers: ["sentry"],
      
      // Limit to 5 tool-call rounds
      maxRounds: 5,
    });

    console.log("✅ Analysis complete!");
    console.log(result.agent.summary);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Check service health and available tools
// ═══════════════════════════════════════════════════════════════════════════

async function example4_ServiceInfo() {
  console.log("\n🏥 Example 4: Service Health & Info\n");
  
  try {
    // Health check
    const health = await client.health();
    console.log("Status:", health.status);
    console.log("Uptime:", Math.floor(health.uptime), "seconds");
    console.log("Providers:", health.providers.join(", "));
    
    // Service info
    const info = await client.info();
    console.log("\nService:", info.name, "v" + info.version);
    
    // List available tools
    const { tools } = await client.listTools();
    console.log(`\nFound ${tools.length} tools:`);
    
    // Group by provider
    const byProvider = tools.reduce((acc, tool) => {
      if (!acc[tool.provider]) acc[tool.provider] = [];
      acc[tool.provider].push(tool.name);
      return acc;
    }, {} as Record<string, string[]>);
    
    for (const [provider, toolNames] of Object.entries(byProvider)) {
      console.log(`\n[${provider}] (${toolNames.length} tools)`);
      toolNames.slice(0, 5).forEach(name => console.log(`  - ${name}`));
      if (toolNames.length > 5) {
        console.log(`  ... and ${toolNames.length - 5} more`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Error handling
// ═══════════════════════════════════════════════════════════════════════════

async function example5_ErrorHandling() {
  console.log("\n⚠️  Example 5: Error Handling\n");
  
  try {
    // This will fail with a 400 error (missing prompt)
    await client.run({ prompt: "" } as any);
  } catch (error: any) {
    if (error.name === "MCPAgentError") {
      console.log("Error type:", error.name);
      console.log("Status code:", error.statusCode);
      console.log("Message:", error.message);
      console.log("Response:", error.response);
    } else {
      console.log("Unexpected error:", error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MCP Agent Client - Quick Start Examples");
  console.log("═══════════════════════════════════════════════════════════");
  
  // Run examples sequentially
  await example4_ServiceInfo();        // Start with health check
  await example1_ProcessSentryIssue(); // Process a single issue
  // await example2_GenericAgentRun();    // Uncomment to run
  // await example3_CustomPromptAndProviders();
  // await example5_ErrorHandling();
  
  console.log("\n✨ Done! Check the examples above and uncomment to try more.\n");
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
