import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { env, buildMCPProviderConfigs } from "./config";
import { logger } from "./logger";
import { mcpRegistry } from "./mcp";
import { prefetchClickUpData } from "./mcp/prefetch";
import { runPipeline } from "./pipeline";
import { runSentryClickUpPreset } from "./presets/sentry-clickup";
import { getOptimizationProfile, applyOptimizationProfile } from "./llm/optimization-profiles";

const { version } = await import("../package.json");

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

/** CORS headers for browser clients */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

/** JSON response helper */
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Parse JSON body safely with size limit */
async function parseBody<T = unknown>(req: Request): Promise<T | null> {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_SIZE) return null;
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Verify Sentry webhook signature (HMAC-SHA256) using timing-safe comparison */
function verifySentrySignature(body: string, signature: string | null, secret: string): boolean {
  if (!secret) return true; // No secret configured — skip validation
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Check API key auth. Returns a 401 Response if auth fails, or null if OK. */
function checkApiKey(req: Request): Response | null {
  if (!env.API_KEY) return null; // No API key configured — skip auth
  const provided = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided === env.API_KEY) return null;
  return json({ error: "Unauthorized: missing or invalid API key" }, 401);
}

// ── Webhook deduplication (bounded, TTL-based) ────────────────
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_MAX_SIZE = 10_000;
const recentlyProcessedIssues = new Map<string, number>();
let dedupCleanupCounter = 0;

function isDuplicate(issueId: string): boolean {
  const now = Date.now();
  // Periodic eviction: run cleanup every 100 calls or when map is full
  dedupCleanupCounter++;
  if (dedupCleanupCounter >= 100 || recentlyProcessedIssues.size >= DEDUP_MAX_SIZE) {
    dedupCleanupCounter = 0;
    for (const [id, ts] of recentlyProcessedIssues) {
      if (now - ts > DEDUP_TTL_MS) recentlyProcessedIssues.delete(id);
    }
  }
  if (recentlyProcessedIssues.has(issueId)) return true;
  recentlyProcessedIssues.set(issueId, now);
  return false;
}

// ── In-flight request tracking for graceful shutdown ────────────
let inFlightRequests = 0;
let isShuttingDown = false;

/** Sentry webhook body shape */
interface SentryWebhookBody {
  action?: string;
  resource?: string;
  data?: {
    issue?: {
      id?: string | number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Bootstrap: register MCP providers from env config ────────
for (const config of buildMCPProviderConfigs()) {
  mcpRegistry.register(config);
}

// ── Prefetch ClickUp data to warm cache (reduces API calls) ──
prefetchClickUpData().catch((err) => 
  logger.warn("Prefetch failed (non-critical)", { error: String(err) })
);

const server = Bun.serve({
  port: env.PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const requestId = randomUUID();

    // ── CORS preflight ──────────────────────────────────────
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Reject requests during shutdown ──────────────────────
    if (isShuttingDown) {
      return json({ error: "Server is shutting down" }, 503);
    }

    inFlightRequests++;
    try {
      return await handleRequest(req, url, method, requestId);
    } finally {
      inFlightRequests--;
    }
  },
});

async function handleRequest(req: Request, url: URL, method: string, requestId: string): Promise<Response> {
  // ── Health ───────────────────────────────────────────────
  if (method === "GET" && url.pathname === "/health") {
    return json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      providers: mcpRegistry.getProviderNames(),
      requestId,
    });
  }

  // ── Root ─────────────────────────────────────────────────
  if (method === "GET" && url.pathname === "/") {
    return json({
      name: "mcp-agent",
      version,
      providers: mcpRegistry.getProviderNames(),
      endpoints: {
        "POST /api/run":            "Run the agent with any prompt (generic)",
        "POST /webhook/sentry":     "Sentry webhook → ClickUp ticket (preset)",
        "POST /api/process-issue":  "Process a Sentry issue by ID (preset)",
        "GET  /api/mcp-tools":      "List all available MCP tools",
        "GET  /api/providers":      "List registered MCP providers",
        "GET  /health":             "Health check",
      },
    });
  }

  // ── Auth check for /api/* endpoints ─────────────────────
  if (url.pathname.startsWith("/api/")) {
    const authErr = checkApiKey(req);
    if (authErr) return authErr;
  }

  // ── Generic Agent Run ────────────────────────────────────
  if (method === "POST" && url.pathname === "/api/run") {
    const body = await parseBody<{
      prompt: string;
      systemPrompt?: string;
      providers?: string[];
      maxRounds?: number;
      maxTokens?: number;
      allowedTools?: string[];
      optimizationProfile?: string;
    }>(req);

    if (!body?.prompt) {
      return json({ error: "Missing 'prompt' in request body" }, 400);
    }

    try {
      // Apply optimization profile if specified
      let options = {
        prompt: body.prompt,
        systemPrompt: body.systemPrompt,
        providers: body.providers,
        maxRounds: body.maxRounds,
        maxTokens: body.maxTokens,
        allowedTools: body.allowedTools,
      };

      if (body.optimizationProfile) {
        const profile = getOptimizationProfile(body.optimizationProfile);
        if (!profile) {
          return json(
            { error: `Unknown optimization profile: ${body.optimizationProfile}. Available: aggressive, balanced, exploratory, fast` },
            400
          );
        }

        const profileSettings = applyOptimizationProfile(profile, body.systemPrompt);
        options = {
          ...options,
          maxRounds: body.maxRounds ?? profileSettings.maxRounds,
          maxTokens: body.maxTokens ?? profileSettings.maxTokens,
          systemPrompt: profileSettings.systemPrompt,
        };

        logger.info("Applying optimization profile", {
          profile: body.optimizationProfile,
          maxRounds: options.maxRounds,
          maxTokens: options.maxTokens,
          jsonOnly: profile.jsonOnly,
        });
      }

      const result = await runPipeline(options);
      return json({ ...result, requestId });
    } catch (err) {
      logger.error("Agent run failed", { requestId, error: String(err) });
      return json({ error: String(err), requestId }, 500);
    }
  }

  // ── Sentry Webhook (preset) ──────────────────────────────
  if (method === "POST" && url.pathname === "/webhook/sentry") {
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    const signature = req.headers.get("sentry-hook-signature");
    if (!verifySentrySignature(rawBody, signature, env.SENTRY_WEBHOOK_SECRET)) {
      logger.warn("Sentry webhook signature verification failed");
      return json({ error: "Invalid webhook signature" }, 401);
    }

    let body: SentryWebhookBody;
    try {
      body = JSON.parse(rawBody) as SentryWebhookBody;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    logger.info("Sentry webhook received", {
      requestId,
      action: body.action,
      resource: body.resource,
      hasIssueData: !!body.data?.issue,
      issueId: body.data?.issue?.id,
      payloadPreview: rawBody.slice(0, 500),
    });

    const action = body.action;
    const issueData = body.data?.issue;

    if ((action === "created" || action === "issue.created") && issueData?.id) {
      const issueIdStr = String(issueData.id);

      // Deduplication: skip if this issue was recently processed
      if (isDuplicate(issueIdStr)) {
        logger.info("Duplicate webhook ignored", { issueId: issueIdStr });
        return json({ accepted: true, issueId: issueIdStr, message: "Duplicate — already processing" });
      }

      // Fire-and-forget: process asynchronously so we respond fast
      runSentryClickUpPreset(issueIdStr).catch((err: unknown) =>
        logger.error("Webhook pipeline failed", { requestId, issueId: issueIdStr, error: String(err) })
      );

      return json({
        accepted: true,
        issueId: issueData.id,
        message: "Issue queued for processing",
      });
    }

    logger.info("Webhook received but not processed", {
      action,
      reason: action !== "created" && action !== "issue.created" ? "Wrong action" : "Missing issue data",
    });

    return json({ accepted: true, action, message: "No action taken" });
  }

  // ── Process Sentry Issue (preset) ────────────────────────
  if (method === "POST" && url.pathname === "/api/process-issue") {
    const body = await parseBody<{ issueId: string; organizationSlug?: string }>(req);
    if (!body?.issueId) {
      return json({ error: "Missing issueId in request body" }, 400);
    }

    try {
      const start = Date.now();
      const agent = await runSentryClickUpPreset(body.issueId, body.organizationSlug);
      const durationMs = Date.now() - start;
      return json({ agent, durationMs, requestId });
    } catch (err) {
      logger.error("Process issue failed", { requestId, error: String(err) });
      return json({ error: String(err), requestId }, 500);
    }
  }

  // ── List MCP Tools ──────────────────────────────────────
  if (method === "GET" && url.pathname === "/api/mcp-tools") {
    try {
      const tools = await mcpRegistry.listAllTools();
      return json({ count: tools.length, tools });
    } catch (err) {
      logger.error("Failed to list MCP tools", { requestId, error: String(err) });
      return json({ error: String(err), requestId }, 500);
    }
  }

  // ── List Providers ──────────────────────────────────────
  if (method === "GET" && url.pathname === "/api/providers") {
    return json({ providers: mcpRegistry.getProviderNames() });
  }

  // ── 404 ─────────────────────────────────────────────────
  return json({ error: "Not found", requestId }, 404);
}

logger.info("🚀 mcp-agent started", {
  port: server.port,
  url: server.url.href,
  providers: mcpRegistry.getProviderNames(),
});

// Graceful shutdown with in-flight request draining
const SHUTDOWN_TIMEOUT_MS = 30_000;

const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down...", { inFlightRequests });

  // Wait for in-flight requests to finish (with timeout)
  const drainStart = Date.now();
  while (inFlightRequests > 0 && Date.now() - drainStart < SHUTDOWN_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (inFlightRequests > 0) {
    logger.warn("Forcing shutdown with in-flight requests", { inFlightRequests });
  }

  await mcpRegistry.disconnectAll();
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
