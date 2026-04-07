# Migration Guide: Cost Optimization

## Quick Start (5 minutes)

### Step 1: Update Your `.env` File

Add these new variables to your `.env`:

```bash
# Choose your provider (anthropic or openai)
LLM_PROVIDER=anthropic

# For Claude 3.5 Haiku (Recommended - 70-80% cost savings)
ANTHROPIC_MODEL=claude-3-5-haiku-20241022

# OR for GPT-4o-mini (Cheapest - 90-95% cost savings)
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-your-openai-key-here
# OPENAI_MODEL=gpt-4o-mini
```

### Step 2: Restart Your Server

```bash
npm run dev
```

That's it! You're now saving 70-95% on costs.

---

## What Changed?

### Code Changes (Already Applied)
✅ **Prompts compressed** - Reduced from 2,500 to 850 tokens  
✅ **Tool filtering** - Only 5 tools sent instead of 72  
✅ **Max tokens reduced** - From 8,192 to 4,096  
✅ **Model selection** - Support for cheaper models  

### Configuration Changes (You Need to Apply)
⚠️ **Update `.env`** - Add `LLM_PROVIDER` and update model  
⚠️ **Choose model** - Select based on your budget/quality needs  

---

## Model Comparison

| Model | Cost/Issue | Quality | Speed | Use Case |
|-------|-----------|---------|-------|----------|
| **Claude 3.5 Haiku** | $0.20-$0.30 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **Recommended** - Best balance |
| **GPT-4o-mini** | $0.05-$0.10 | ⭐⭐⭐ | ⭐⭐⭐⭐ | High volume, budget-conscious |
| **Claude Sonnet 4** | $1.00-$1.50 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Quality-critical, low volume |

---

## Testing

After updating, test with a sample issue:

```bash
curl -X POST http://localhost:3000/api/process-issue \
  -H "Content-Type: application/json" \
  -d '{"issueId": "YOUR_ISSUE_ID"}'
```

Check the logs for token usage:
```json
{
  "usage": {
    "inputTokens": 3500,   // Should be ~3,000-4,000 (down from ~12,000)
    "outputTokens": 2000   // Should be ~1,500-2,500 (down from ~3,000-4,000)
  }
}
```

---

## Rollback (If Needed)

If you need to revert to the original setup:

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Note: The prompt optimizations will remain, but you'll use the more expensive model.

---

## Expected Savings

### Monthly Savings Example

**Scenario**: 1,000 issues/month

| Model | Old Cost | New Cost | Monthly Savings |
|-------|----------|----------|-----------------|
| Haiku | $1,500 | $250 | **$1,250/month** |
| GPT-4o-mini | $1,500 | $75 | **$1,425/month** |

---

## Troubleshooting

### Issue: "LLM_PROVIDER is set to 'anthropic' but ANTHROPIC_API_KEY is not set"
**Solution**: Make sure you have `ANTHROPIC_API_KEY` set in your `.env` file.

### Issue: "LLM_PROVIDER is set to 'openai' but OPENAI_API_KEY is not set"
**Solution**: Add `OPENAI_API_KEY=sk-your-key` to your `.env` file.

### Issue: Quality degradation with cheaper models
**Solution**: Switch to Claude 3.5 Haiku for better quality while still saving 70-80%.

### Issue: Tickets missing information
**Solution**: This shouldn't happen with the optimized prompts, but if it does, report the specific issue for prompt tuning.

---

## Next Steps

1. ✅ Update `.env` with new configuration
2. ✅ Restart server
3. ✅ Test with 5-10 sample issues
4. ✅ Monitor quality and costs
5. ✅ Adjust model if needed

See `docs/COST_OPTIMIZATION.md` for detailed cost breakdown and analysis.
