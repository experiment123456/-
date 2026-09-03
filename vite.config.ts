import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import "./config.mjs";
import { attachRelay, serveRelayInfo } from "./relay.mjs";
import { createAuthHandler } from "./auth.mjs";
import { authenticatedUserFromRequest } from "./auth.mjs";
import { createAgentHandler } from "./agent.mjs";

const authHandler = createAuthHandler();
const agentHandler = createAgentHandler({ getUser: authenticatedUserFromRequest });

const relayPlugin = {
  name: "lumora-websocket-relay",
  configureServer(server: { httpServer: import("node:http").Server | null; middlewares: { use: (handler: ReturnType<typeof createAuthHandler>) => void } }) {
    server.middlewares.use((request, response, next) => {
      if (!server.httpServer || !serveRelayInfo(request, response, server.httpServer)) next?.();
    });
    server.middlewares.use(agentHandler);
    server.middlewares.use(authHandler);
    if (server.httpServer) attachRelay(server.httpServer);
  },
  configurePreviewServer(server: { httpServer: import("node:http").Server | null; middlewares: { use: (handler: ReturnType<typeof createAuthHandler>) => void } }) {
    server.middlewares.use((request, response, next) => {
      if (!server.httpServer || !serveRelayInfo(request, response, server.httpServer)) next?.();
    });
    server.middlewares.use(agentHandler);
    server.middlewares.use(authHandler);
    if (server.httpServer) attachRelay(server.httpServer);
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), relayPlugin],
  server: {
    watch: {
      ignored: ["**/.edge-qa-*/**", "**/qa-*.png"],
    },
  },
});
