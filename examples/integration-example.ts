/**
 * Real-world integration example: Using MCP Agent in your application
 * 
 * This shows how to integrate the client into a typical Node.js/TypeScript app,
 * such as a webhook handler, scheduled job, or API endpoint.
 */

import { MCPAgentClient, MCPAgentError } from "../src/client";

// ═══════════════════════════════════════════════════════════════════════════
// Setup: Initialize client once (singleton pattern)
// ═══════════════════════════════════════════════════════════════════════════

const agentClient = new MCPAgentClient({
  baseUrl: process.env.MCP_AGENT_URL || "http://localhost:3001",
  retries: 3,
  timeout: 120000,
  debug: process.env.NODE_ENV === "development",
});

// ═══════════════════════════════════════════════════════════════════════════
// Use Case 1: Webhook Handler (e.g., Express.js)
// ═══════════════════════════════════════════════════════════════════════════

async function handleSentryWebhook(webhookPayload: any) {
  const issueId = webhookPayload.data?.issue?.id;
  
  if (!issueId) {
    console.log("No issue ID in webhook payload");
    return { success: false, reason: "missing_issue_id" };
  }

  try {
    console.log(`Processing Sentry issue: ${issueId}`);
    
    const result = await agentClient.processSentryIssue({
      issueId: String(issueId),
      organizationSlug: "saras-analytics",
    });

    // Extract ClickUp ticket URL
    const clickupCall = result.agent.toolCalls.find(
      tc => tc.tool === "clickup_create_task"
    );
    
    const ticketUrl = clickupCall 
      ? JSON.parse(clickupCall.result).task_url 
      : null;

    console.log(`✅ Created ticket: ${ticketUrl}`);
    
    return {
      success: true,
      issueId,
      ticketUrl,
      durationMs: result.durationMs,
    };
  } catch (error) {
    console.error(`❌ Failed to process issue ${issueId}:`, error);
    
    if (error instanceof MCPAgentError) {
      return {
        success: false,
        issueId,
        error: error.message,
        statusCode: error.statusCode,
      };
    }
    
    throw error; // Re-throw unexpected errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Use Case 2: Scheduled Job (e.g., cron job to process recent issues)
// ═══════════════════════════════════════════════════════════════════════════

async function scheduledTriageJob() {
  console.log("🕐 Starting scheduled triage job...");
  
  try {
    const result = await agentClient.run({
      prompt: `
        Find all unresolved Sentry issues from the last 24 hours.
        For each issue:
        1. Analyze severity based on user impact and frequency
        2. Create a ClickUp ticket for issues affecting >10 users
        3. Prioritize tickets based on severity
        
        Return a summary of tickets created.
      `,
      providers: ["sentry", "clickup"],
      maxRounds: 20,
    });

    console.log("✅ Triage job completed");
    console.log(result.agent.summary);
    
    return {
      success: true,
      toolCallsExecuted: result.agent.toolCalls.length,
      durationMs: result.durationMs,
    };
  } catch (error) {
    console.error("❌ Triage job failed:", error);
    
    // Send alert to monitoring system
    // await sendAlert({ type: "triage_job_failed", error });
    
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Use Case 3: API Endpoint (e.g., manual trigger from dashboard)
// ═══════════════════════════════════════════════════════════════════════════

async function handleManualTriageRequest(req: {
  issueIds: string[];
  priority?: "urgent" | "high" | "normal" | "low";
}) {
  const results = [];
  
  for (const issueId of req.issueIds) {
    try {
      const result = await agentClient.processSentryIssue({ issueId });
      results.push({ issueId, success: true, result });
    } catch (error) {
      results.push({ 
        issueId, 
        success: false, 
        error: error instanceof MCPAgentError ? error.message : String(error),
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  return {
    total: req.issueIds.length,
    successful: successCount,
    failed: req.issueIds.length - successCount,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Use Case 4: Health Check Middleware
// ═══════════════════════════════════════════════════════════════════════════

async function checkAgentHealth() {
  try {
    const health = await agentClient.health();
    
    return {
      healthy: health.status === "ok",
      providers: health.providers,
      uptime: health.uptime,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof MCPAgentError ? error.message : String(error),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Use Case 5: Custom Analysis Task
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeErrorTrends() {
  try {
    const result = await agentClient.run({
      prompt: `
        Analyze Sentry issues from the last 7 days and identify:
        1. Most common error types
        2. Errors with increasing frequency
        3. Errors affecting the most users
        
        Provide a concise summary with actionable insights.
      `,
      systemPrompt: "You are a data analyst. Focus on trends and patterns.",
      providers: ["sentry"],
      maxRounds: 10,
    });

    return {
      analysis: result.agent.summary,
      toolsUsed: result.agent.toolCalls.map(tc => tc.tool),
      durationMs: result.durationMs,
    };
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Example: Express.js Integration
// ═══════════════════════════════════════════════════════════════════════════

/*
import express from "express";

const app = express();
app.use(express.json());

// Sentry webhook endpoint
app.post("/webhooks/sentry", async (req, res) => {
  const result = await handleSentryWebhook(req.body);
  res.json(result);
});

// Manual triage endpoint
app.post("/api/triage", async (req, res) => {
  const result = await handleManualTriageRequest(req.body);
  res.json(result);
});

// Health check
app.get("/health/agent", async (req, res) => {
  const health = await checkAgentHealth();
  res.status(health.healthy ? 200 : 503).json(health);
});

app.listen(3000, () => console.log("Server running on :3000"));
*/

// ═══════════════════════════════════════════════════════════════════════════
// Demo: Run examples
// ═══════════════════════════════════════════════════════════════════════════

async function demo() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Integration Examples Demo");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Health check
  console.log("1️⃣  Checking agent health...");
  const health = await checkAgentHealth();
  console.log("   Status:", health.healthy ? "✅ Healthy" : "❌ Unhealthy");
  console.log("   Providers:", health.providers?.join(", ") || "N/A");
  console.log();

  // 2. Simulate webhook
  console.log("2️⃣  Simulating Sentry webhook...");
  const webhookResult = await handleSentryWebhook({
    data: { issue: { id: "7290814283" } }
  });
  console.log("   Result:", webhookResult.success ? "✅ Success" : "❌ Failed");
  if (webhookResult.ticketUrl) {
    console.log("   Ticket:", webhookResult.ticketUrl);
  }
  console.log();

  // 3. Custom analysis
  console.log("3️⃣  Running error trend analysis...");
  try {
    const analysis = await analyzeErrorTrends();
    console.log("   ✅ Analysis complete");
    console.log("   Tools used:", analysis.toolsUsed.join(", "));
  } catch (error) {
    console.log("   ⚠️  Analysis skipped (requires Sentry data)");
  }

  console.log("\n✨ Demo complete!\n");
}

// Run demo if executed directly
if (import.meta.main) {
  demo().catch(console.error);
}

export {
  handleSentryWebhook,
  scheduledTriageJob,
  handleManualTriageRequest,
  checkAgentHealth,
  analyzeErrorTrends,
};
