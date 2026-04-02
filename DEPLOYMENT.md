# Deployment Guide

This guide covers multiple deployment options for the MCP Agent.

## Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

**Why Railway?**
- ✅ Native Bun support
- ✅ Auto-deploys from GitHub
- ✅ Free tier available ($5/month credit)
- ✅ Automatic HTTPS
- ✅ Simple environment variable management

**Steps:**

1. **Create Railway account**: [railway.app](https://railway.app)

2. **Deploy from GitHub:**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Link to this project
   railway link
   
   # Deploy
   railway up
   ```

3. **Set environment variables** in Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `SENTRY_AUTH_TOKEN`
   - `SENTRY_ORG_SLUG`
   - `CLICKUP_API_TOKEN`
   - `CLICKUP_WORKSPACE_ID`
   - `API_KEY` (optional, for securing endpoints)

4. **Get your deployment URL** from Railway dashboard

**Alternative: Deploy via GitHub**
1. Go to [railway.app/new](https://railway.app/new)
2. Select "Deploy from GitHub repo"
3. Choose `sarasanalytics-com/mcp-agent`
4. Railway auto-detects `railway.toml` and deploys

---

### Option 2: Fly.io (Global Edge Deployment)

**Why Fly.io?**
- ✅ Global edge deployment
- ✅ Free tier (3 shared-cpu VMs)
- ✅ Good for low-latency worldwide access

**Steps:**

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Launch app:**
   ```bash
   fly launch
   # Answer prompts:
   # - App name: mcp-agent (or your choice)
   # - Region: choose closest to you
   # - Use existing fly.toml: Yes
   ```

4. **Set secrets:**
   ```bash
   fly secrets set ANTHROPIC_API_KEY=your-key
   fly secrets set SENTRY_AUTH_TOKEN=your-token
   fly secrets set SENTRY_ORG_SLUG=your-org
   fly secrets set CLICKUP_API_TOKEN=your-token
   fly secrets set CLICKUP_WORKSPACE_ID=your-workspace-id
   fly secrets set API_KEY=your-api-key
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

6. **Get URL:**
   ```bash
   fly status
   ```

---

### Option 3: Render (Simple Auto-Deploy)

**Why Render?**
- ✅ Auto-deploys from GitHub
- ✅ Free tier available
- ✅ Native Docker support

**Steps:**

1. Go to [render.com](https://render.com)

2. **Create New Web Service**
   - Connect GitHub repository: `sarasanalytics-com/mcp-agent`
   - Render auto-detects `render.yaml`

3. **Configure environment variables** in Render dashboard:
   - `ANTHROPIC_API_KEY`
   - `SENTRY_AUTH_TOKEN`
   - `SENTRY_ORG_SLUG`
   - `CLICKUP_API_TOKEN`
   - `CLICKUP_WORKSPACE_ID`
   - `API_KEY`

4. **Deploy** - Render automatically builds and deploys

---

### Option 4: Docker (Self-Hosted)

**Why Docker?**
- ✅ Works anywhere (AWS, GCP, Azure, DigitalOcean, VPS)
- ✅ Full control
- ✅ Easy local testing

**Local Testing:**

```bash
# Build image
docker build -t mcp-agent .

# Run with environment file
docker run -p 3001:3001 --env-file .env mcp-agent

# Or use docker-compose
docker-compose up
```

**Production Deployment:**

1. **Build and push to registry:**
   ```bash
   # Build
   docker build -t your-registry/mcp-agent:latest .
   
   # Push to Docker Hub
   docker push your-registry/mcp-agent:latest
   
   # Or push to GitHub Container Registry
   docker tag mcp-agent ghcr.io/sarasanalytics-com/mcp-agent:latest
   docker push ghcr.io/sarasanalytics-com/mcp-agent:latest
   ```

2. **Deploy to your server:**
   ```bash
   # Pull and run
   docker pull your-registry/mcp-agent:latest
   docker run -d \
     -p 3001:3001 \
     -e ANTHROPIC_API_KEY=your-key \
     -e SENTRY_AUTH_TOKEN=your-token \
     -e SENTRY_ORG_SLUG=your-org \
     -e CLICKUP_API_TOKEN=your-token \
     -e CLICKUP_WORKSPACE_ID=your-workspace-id \
     --name mcp-agent \
     --restart unless-stopped \
     your-registry/mcp-agent:latest
   ```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |

### Optional MCP Providers

| Variable | Description |
|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Sentry authentication token |
| `SENTRY_ORG_SLUG` | Sentry organization slug |
| `SENTRY_PROJECT_SLUG` | Sentry project slug |
| `CLICKUP_API_TOKEN` | ClickUp API token |
| `CLICKUP_WORKSPACE_ID` | ClickUp workspace ID |
| `CLICKUP_LIST_ID` | Default ClickUp list ID |
| `CLICKUP_MCP_URL` | ClickUp MCP server URL |

### Agent Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude model |
| `AGENT_MAX_TOOL_ROUNDS` | `15` | Max tool-call rounds |
| `API_KEY` | - | Optional API key for securing endpoints |
| `SENTRY_WEBHOOK_SECRET` | - | Sentry webhook signature secret |

---

## Post-Deployment

### 1. Verify Deployment

```bash
# Health check
curl https://your-deployment-url/health

# Check providers
curl https://your-deployment-url/api/providers

# List available tools
curl https://your-deployment-url/api/mcp-tools
```

### 2. Configure Sentry Webhook

1. Go to Sentry → Settings → Integrations → Internal Integrations
2. Create new integration
3. Set webhook URL: `https://your-deployment-url/webhook/sentry`
4. Enable **Issue** alerts
5. Copy webhook secret and set as `SENTRY_WEBHOOK_SECRET` env var

### 3. Test the Agent

```bash
# Test generic agent run
curl -X POST https://your-deployment-url/api/run \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key" \
  -d '{"prompt": "List all Sentry issues from the last 24 hours"}'

# Test Sentry issue processing
curl -X POST https://your-deployment-url/api/process-issue \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key" \
  -d '{"issueId": "12345"}'
```

---

## Monitoring

### Health Checks

All deployment platforms use the `/health` endpoint:

```json
{
  "status": "ok",
  "uptime": 12345.67,
  "timestamp": "2026-04-02T10:00:00Z",
  "providers": ["sentry", "clickup"],
  "requestId": "uuid"
}
```

### Logs

- **Railway**: View in Railway dashboard
- **Fly.io**: `fly logs`
- **Render**: View in Render dashboard
- **Docker**: `docker logs mcp-agent`

### Metrics

Monitor these metrics:
- Request count and latency
- Tool call success/failure rates
- MCP provider connection status
- Memory and CPU usage

---

## Scaling

### Horizontal Scaling

The agent is stateless and can be scaled horizontally:

**Railway:**
```bash
railway scale --replicas 3
```

**Fly.io:**
```bash
fly scale count 3
```

**Docker:**
```bash
docker-compose up --scale mcp-agent=3
```

### Vertical Scaling

Increase resources if needed:

**Railway:** Upgrade plan in dashboard

**Fly.io:**
```bash
fly scale vm shared-cpu-2x
fly scale memory 1024
```

---

## Troubleshooting

### Common Issues

**Issue: MCP providers not connecting**
- Check environment variables are set correctly
- Verify API tokens are valid
- Check logs for connection errors

**Issue: High latency**
- Consider deploying to region closer to users
- Enable caching if available
- Scale horizontally

**Issue: Out of memory**
- Increase memory allocation
- Check for memory leaks in logs
- Reduce `AGENT_MAX_TOOL_ROUNDS`

**Issue: Webhook timeouts**
- Webhooks return 200 immediately and process async
- Check background job processing in logs
- Increase timeout if needed

---

## Security Best Practices

1. **Always set `API_KEY`** for production deployments
2. **Use `SENTRY_WEBHOOK_SECRET`** to verify webhook signatures
3. **Rotate API keys regularly**
4. **Use HTTPS** (automatic on Railway, Fly.io, Render)
5. **Monitor logs** for suspicious activity
6. **Limit CORS** if needed (modify `CORS_HEADERS` in code)

---

## Cost Estimates

### Railway
- Free tier: $5/month credit
- Hobby: $5/month (after credit)
- Pro: $20/month

### Fly.io
- Free tier: 3 shared-cpu VMs, 160GB bandwidth
- Paid: ~$2-10/month depending on usage

### Render
- Free tier: Available (with limitations)
- Starter: $7/month
- Standard: $25/month

### Self-Hosted (Docker)
- VPS: $5-20/month (DigitalOcean, Linode, etc.)
- AWS/GCP: Variable, ~$10-50/month

**Plus API costs:**
- Anthropic Claude: ~$3-15 per 1M tokens (model dependent)
- MCP server costs: Usually free (Sentry, ClickUp, GitHub)

---

## Next Steps

1. Choose deployment platform
2. Deploy using steps above
3. Configure environment variables
4. Set up Sentry webhook
5. Test the deployment
6. Monitor and scale as needed

For questions or issues, open an issue on GitHub: https://github.com/sarasanalytics-com/mcp-agent
