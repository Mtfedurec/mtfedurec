import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The client bundle reads Supabase credentials from the VITE_-prefixed env vars
// (Vite only exposes VITE_* to the browser). Production sets the unprefixed
// SUPABASE_* vars, so mirror them into the VITE_ names at build time when the
// prefixed ones are absent. This keeps local .env values untouched.
process.env["VITE_SUPABASE_URL"] ||= process.env["SUPABASE_URL"];
process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||= process.env["SUPABASE_PUBLISHABLE_KEY"];

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },

  vite: {
    server: {
      allowedHosts: true,
    },
  },
});
