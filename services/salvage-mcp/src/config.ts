export interface SalvageConfig {
  brainBaseUrl: string;
  coreBaseUrl: string;
  serverName: string;
  serverVersion: string;
}

export const config: SalvageConfig = {
  brainBaseUrl: process.env.BRAIN_BASE_URL || "http://localhost:8000",
  coreBaseUrl: process.env.CORE_BASE_URL || "http://localhost:8080",
  serverName: "salvage-mcp",
  serverVersion: "0.1.0",
};
