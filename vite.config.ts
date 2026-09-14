import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The browser Supabase client reads the VITE_-prefixed public vars, which Vite
// inlines at build time. Some hosts (e.g. Vercel via the Supabase integration)
// only provide the non-prefixed SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY. Backfill
// the VITE_ vars from those so the client bundle is configured in production.
// Only the publishable (public) key is exposed here — never the service-role key.
if (!process.env["VITE_SUPABASE_URL"] && process.env["SUPABASE_URL"]) {
  process.env["VITE_SUPABASE_URL"] = process.env["SUPABASE_URL"];
}
if (!process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] && process.env["SUPABASE_PUBLISHABLE_KEY"]) {
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = process.env["SUPABASE_PUBLISHABLE_KEY"];
}

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
