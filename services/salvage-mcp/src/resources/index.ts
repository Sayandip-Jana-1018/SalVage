import { BrainClient } from "../clients/brainClient.js";

export function registerResources(server: any, brainClient: BrainClient) {
  server.resource(
    "rail-health-matrix",
    "salvage://rails/health",
    async (uri: URL) => {
      const data = await brainClient.getRailHealth();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );
}
