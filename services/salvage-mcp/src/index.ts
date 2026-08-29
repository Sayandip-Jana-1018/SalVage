#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrainClient } from "./clients/brainClient.js";
import { CoreClient } from "./clients/coreClient.js";
import { config } from "./config.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  const brainClient = new BrainClient();
  const coreClient = new CoreClient();

  // Register tools, resources, and prompts
  registerTools(server, brainClient, coreClient);
  registerResources(server, brainClient);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Salvage MCP Server running on stdio (version ${config.serverVersion})`);
}

main().catch((error) => {
  console.error("Fatal error in Salvage MCP Server:", error);
  process.exit(1);
});
