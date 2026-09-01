import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },

  vite: {
    server: {
      allowedHosts: ["remarkable-want-pennsylvania-arthur.trycloudflare.com"],
    },
  },
});
