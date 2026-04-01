#!/usr/bin/env bun
import { env, buildMCPProviderConfigs } from "../src/config";
import { mcpRegistry } from "../src/mcp";

async function findList(listName?: string) {
  // Register providers from env config
  for (const config of buildMCPProviderConfigs()) {
    mcpRegistry.register(config);
  }

  const result = await mcpRegistry.executeTool("clickup_get_list", {
    list_name: listName || "Sentry Issues",
    workspace_id: env.CLICKUP_WORKSPACE_ID,
  });

  console.log("List found:");
  console.log(result);

  await mcpRegistry.disconnectAll();
}

const listName = process.argv[2];
findList(listName).catch(console.error);
