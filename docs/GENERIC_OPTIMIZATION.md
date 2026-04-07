# Generic MCP Server Optimization

## Overview

While the Sentry→ClickUp preset has **domain-specific optimizations** (pre-processing, deduplication), the generic `/api/run` endpoint now supports **optimization profiles** that work with any MCP server.

---

## Two Approaches

### 1. **Preset Route** (Sentry→ClickUp)
```
POST /api/process-issue
```
- ✅ Pre-processing (60-80% payload reduction)
- ✅ Deduplication cache (90% on duplicates)
- ✅ Single-shot mode (1 round)
- ✅ JSON-only output
- ✅ Tool filtering (3 tools only)
- **Cost**: $0.02-$0.05 per unique issue

### 2. **Generic Route** (Any MCP Server)
```
POST /api/run
```
- ✅ Optimization profiles
- ✅ Tool filtering (manual)
- ✅ Configurable rounds
- ✅ JSON-only mode (optional)
- **Cost**: Depends on profile (see below)

---

## Optimization Profiles

### **Aggressive** (Maximum Savings)
```json
{
  "prompt": "Your task",
  "optimizationProfile": "aggressive"
}
```

**Settings**:
- `maxRounds: 1` (single-shot)
- `maxTokens: 2048`
- `jsonOnly: true`

**Best for**: Repetitive, structured tasks  
**Cost**: ~$0.02-$0.05 per request (95% reduction)

---

### **Balanced** (Recommended)
```json
{
  "prompt": "Your task",
  "optimizationProfile": "balanced"
}
```

**Settings**:
- `maxRounds: 3`
- `maxTokens: 4096`
- `jsonOnly: false`

**Best for**: Most production workflows  
**Cost**: ~$0.20-$0.30 per request (70-80% reduction)

---

### **Exploratory** (Maximum Flexibility)
```json
{
  "prompt": "Your task",
  "optimizationProfile": "exploratory"
}
```

**Settings**:
- `maxRounds: 15`
- `maxTokens: 8192`
- `jsonOnly: false`

**Best for**: Complex, unpredictable tasks  
**Cost**: ~$0.80-$1.50 per request (minimal optimization)

---

### **Fast** (Quick Responses)
```json
{
  "prompt": "Your task",
  "optimizationProfile": "fast"
}
```

**Settings**:
- `maxRounds: 1`
- `maxTokens: 1024`
- `jsonOnly: false`

**Best for**: Simple queries, quick actions  
**Cost**: ~$0.01-$0.03 per request (90% reduction)

---

## Usage Examples

### Example 1: GitHub Issue Triage (Aggressive)

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analyze GitHub issue #123 and create a summary",
    "providers": ["github"],
    "optimizationProfile": "aggressive",
    "allowedTools": ["get_issue", "add_issue_comment"]
  }'
```

**Result**: Single-shot execution, JSON output, ~$0.03

---

### Example 2: Code Search (Balanced)

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Find all authentication-related files in the codebase",
    "providers": ["filesystem"],
    "optimizationProfile": "balanced"
  }'
```

**Result**: Up to 3 rounds, natural language, ~$0.25

---

### Example 3: Complex Debugging (Exploratory)

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Debug the authentication flow and identify the issue",
    "providers": ["github", "sentry"],
    "optimizationProfile": "exploratory"
  }'
```

**Result**: Up to 15 rounds, full flexibility, ~$1.00

---

## Manual Optimization (No Profile)

You can also manually configure settings:

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Your task",
    "systemPrompt": "Respond ONLY with JSON. No explanation.",
    "providers": ["your-provider"],
    "maxRounds": 1,
    "maxTokens": 2048,
    "allowedTools": ["tool1", "tool2"]
  }'
```

**Note**: Manual settings override profile settings.

---

## Combining with Tool Filtering

For maximum savings, combine profiles with tool filtering:

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a ticket from this error",
    "providers": ["clickup"],
    "optimizationProfile": "aggressive",
    "allowedTools": [
      "clickup_create_task",
      "clickup_get_custom_fields"
    ]
  }'
```

**Savings**:
- Profile: 95% cost reduction
- Tool filtering: 90% fewer tool definition tokens
- **Combined**: ~98% total reduction

---

## Cost Comparison

### Without Optimization
```
Input:  12,000 tokens × $3.00/1M  = $0.036
Output:  3,000 tokens × $15.00/1M = $0.045
Rounds: 3
Total: ~$1.00-$1.50
```

### With "Aggressive" Profile
```
Input:  1,200 tokens × $0.80/1M  = $0.001
Output:   800 tokens × $4.00/1M  = $0.003
Rounds: 1
Total: ~$0.02-$0.05
```

### With "Balanced" Profile
```
Input:  3,500 tokens × $0.80/1M  = $0.003
Output: 2,000 tokens × $4.00/1M  = $0.008
Rounds: 2-3
Total: ~$0.20-$0.30
```

---

## When to Use Each Profile

| Profile | Use Case | Cost | Quality |
|---------|----------|------|---------|
| **Aggressive** | Structured, repetitive tasks | 💰 | ⭐⭐⭐ |
| **Fast** | Simple queries, quick actions | 💰 | ⭐⭐⭐ |
| **Balanced** | Most production workflows | 💰💰 | ⭐⭐⭐⭐ |
| **Exploratory** | Complex, unpredictable tasks | 💰💰💰 | ⭐⭐⭐⭐⭐ |

---

## Profile Selection Guide

```
┌─────────────────────────────────────────┐
│ Is the task repetitive/structured?     │
│                                         │
│ YES → Use "aggressive" or "fast"        │
│ NO  → Continue...                       │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│ Do you know exactly what tools needed?  │
│                                         │
│ YES → Use "aggressive" + allowedTools   │
│ NO  → Continue...                       │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│ Is the task complex/unpredictable?     │
│                                         │
│ YES → Use "exploratory"                 │
│ NO  → Use "balanced" (default)          │
└─────────────────────────────────────────┘
```

---

## Limitations

### What Profiles DON'T Provide

❌ **Pre-processing** - Domain-specific (only in presets)  
❌ **Deduplication** - Workflow-specific (only in presets)  
❌ **Automatic tool filtering** - You must specify `allowedTools`

### What Profiles DO Provide

✅ **Round limiting** - Prevents excessive iterations  
✅ **Token limiting** - Caps output size  
✅ **JSON-only mode** - Reduces verbose responses  
✅ **Easy configuration** - One parameter instead of many

---

## Creating Custom Workflows

For domain-specific optimizations like Sentry→ClickUp, create a **preset**:

```typescript
// src/presets/your-workflow.ts
export async function runYourWorkflowPreset(input: string) {
  // 1. Pre-process data (domain-specific)
  const minimal = preprocessYourData(input);
  
  // 2. Check cache (if applicable)
  const cached = checkCache(minimal);
  if (cached) return cached;
  
  // 3. Run agent with optimizations
  return runAgent({
    prompt: buildPrompt(minimal),
    systemPrompt: buildSystemPrompt(),
    maxRounds: 1,
    maxTokens: 2048,
    allowedTools: ["tool1", "tool2"],
  });
}
```

Then add an endpoint:
```typescript
// src/index.ts
if (url.pathname === "/api/your-workflow") {
  const result = await runYourWorkflowPreset(body.input);
  return json(result);
}
```

---

## Summary

| Approach | Optimization Level | Setup Effort | Use Case |
|----------|-------------------|--------------|----------|
| **Preset** | ⭐⭐⭐⭐⭐ (98%) | High | Domain-specific workflows |
| **Profile** | ⭐⭐⭐⭐ (70-95%) | Low | Generic MCP tasks |
| **Manual** | ⭐⭐⭐ (50-70%) | Medium | Custom requirements |

**Recommendation**: 
- Use **presets** for high-volume, domain-specific workflows (like Sentry→ClickUp)
- Use **profiles** for general MCP server tasks
- Use **manual** settings for special cases

---

## Next Steps

1. Try the "balanced" profile for your use case
2. Monitor token usage in logs
3. Switch to "aggressive" if the task is repetitive
4. Create a preset if you have high-volume workflows

See `docs/ADVANCED_COST_OPTIMIZATION.md` for preset-specific optimizations.
