import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { attachRelay, serveRelayInfo } from "./relay.mjs";
import { createAuthHandler } from "./auth.mjs";

const authHandler = createAuthHandler();

const relayPlugin = {
  name: "lumora-websocket-relay",
  configureServer(server: { httpServer: import("node:http").Server | null; middlewares: { use: (handler: ReturnType<typeof createAuthHandler>) => void } }) {
    server.middlewares.use((request, response, next) => {
      if (!server.httpServer || !serveRelayInfo(request, response, server.httpServer)) next?.();
    });
    server.middlewares.use(authHandler);
    if (server.httpServer) attachRelay(server.httpServer);
  },
  configurePreviewServer(server: { httpServer: import("node:http").Server | null; middlewares: { use: (handler: ReturnType<typeof createAuthHandler>) => void } }) {
    server.middlewares.use((request, response, next) => {
      if (!server.httpServer || !serveRelayInfo(request, response, server.httpServer)) next?.();
    });
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
