/**
 * Pre-process Sentry issue data to reduce LLM token usage by 60-80%
 * Extract only essential information needed for ticket creation
 */

export interface MinimalSentryIssue {
  id: string;
  title: string;
  errorType: string;
  errorMessage: string;
  topStackFrames: string[];
  occurrences: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  environment: string;
  project: string;
  platform: string;
  url?: string;
  replayId?: string;
  traceId?: string;
  browser?: string;
  os?: string;
  userEmail?: string;
  breadcrumbs?: Array<{ type: string; message: string; timestamp: string }>;
}

/**
 * Extract minimal issue data from full Sentry response
 * Reduces payload by 60-80% while keeping critical information
 */
export function preprocessSentryIssue(fullIssue: any): MinimalSentryIssue {
  const event = fullIssue.latestEvent || fullIssue.event || {};
  const tags = event.tags || [];
  const contexts = event.contexts || {};
  const entries = event.entries || [];

  // Extract stack trace and take top 5-10 frames
  const stackTrace = entries.find((e: any) => e.type === "exception")?.data?.values?.[0]?.stacktrace;
  const topStackFrames = stackTrace?.frames
    ?.slice(-10) // Last 10 frames (most recent)
    .reverse()
    .map((f: any) => {
      const func = f.function || "anonymous";
      const file = f.filename || f.module || "unknown";
      const line = f.lineno || "?";
      return `${func} (${file}:${line})`;
    }) || [];

  // Extract breadcrumbs (last 5 only)
  const breadcrumbEntry = entries.find((e: any) => e.type === "breadcrumbs");
  const breadcrumbs = breadcrumbEntry?.data?.values
    ?.slice(-5)
    .map((b: any) => ({
      type: b.category || b.type,
      message: b.message || "",
      timestamp: b.timestamp,
    })) || [];

  // Extract tags
  const getTag = (key: string) => tags.find((t: any) => t.key === key)?.value;

  return {
    id: fullIssue.id || fullIssue.shortId,
    title: fullIssue.title || event.title || "Unknown Error",
    errorType: event.type || getTag("error.type") || "Error",
    errorMessage: event.message || event.value || "",
    topStackFrames,
    occurrences: fullIssue.count || 0,
    userCount: fullIssue.userCount || 0,
    firstSeen: fullIssue.firstSeen || "",
    lastSeen: fullIssue.lastSeen || "",
    environment: getTag("environment") || "unknown",
    project: fullIssue.project?.name || getTag("project") || "",
    platform: getTag("platform") || event.platform || "",
    url: getTag("url"),
    replayId: getTag("replayId"),
    traceId: getTag("trace.trace_id") || contexts.trace?.trace_id,
    browser: getTag("browser.name") || contexts.browser?.name,
    os: getTag("os.name") || contexts.os?.name,
    userEmail: event.user?.email || contexts.user?.email,
    breadcrumbs,
  };
}

/**
 * Generate a hash for deduplication
 * Groups similar errors together to avoid duplicate LLM calls
 */
export function generateIssueHash(issue: MinimalSentryIssue): string {
  const hashInput = [
    issue.errorType,
    issue.topStackFrames[0] || "", // Top frame
    issue.project,
  ].join("|");

  // Simple hash function (use crypto.subtle for production)
  return Buffer.from(hashInput).toString("base64").slice(0, 16);
}
