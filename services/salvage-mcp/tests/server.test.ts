import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BrainClient } from "../src/clients/brainClient.js";
import { CoreClient } from "../src/clients/coreClient.js";
import { registerPrompts } from "../src/prompts/index.js";
import { registerResources } from "../src/resources/index.js";
import { registerTools } from "../src/tools/index.js";

describe("McpServer Registration", () => {
  it("registers all tools, resources, and prompts without error", () => {
    const server = new McpServer({
      name: "salvage-mcp-test",
      version: "0.1.0",
    });

    const brainClient = new BrainClient();
    const coreClient = new CoreClient();

    expect(() => {
      registerTools(server, brainClient, coreClient);
      registerResources(server, brainClient);
      registerPrompts(server);
    }).not.toThrow();
  });
});
