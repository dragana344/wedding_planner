import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import type { Plugin } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Storybook never talks to a real project. These are set before Next.js reads
// .env.local (which does not override what is already set), so next.config.mjs
// passes its required-env check and no story can reach the cloud database.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "storybook-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "storybook-service-role-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://kadesi.mk";
delete process.env.NEXT_PUBLIC_SENTRY_DSN;

const NO_SERVER = "Во Storybook нема сервер: ова е само приказ.";

/**
 * Server actions ("use server" files) reach the database and cannot run in a
 * browser bundle. Next.js swaps them for network calls; here each export
 * becomes a function that answers with a plain "no server" result.
 */
function serverActionStubs(): Plugin {
  return {
    name: "storybook-server-action-stubs",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("node_modules") || !/^\s*["']use server["']/.test(code)) return null;
      const names = new Set<string>();
      for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
      for (const m of code.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1]);
      const stubs = [...names].map((n) => `export async function ${n}() { return { ok: false, error: ${JSON.stringify(NO_SERVER)} }; }`);
      return { code: stubs.join("\n"), map: null };
    },
  };
}

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  core: { disableTelemetry: true },
  async viteFinal(viteConfig) {
    viteConfig.resolve ??= {};
    const alias = viteConfig.resolve.alias;
    const serverOnly = path.join(root, "tests/stubs/server-only.ts");
    // Same stand-in the unit tests use: `server-only` throws outside an RSC build.
    if (Array.isArray(alias)) alias.push({ find: "server-only", replacement: serverOnly });
    else viteConfig.resolve.alias = { ...alias, "server-only": serverOnly };
    viteConfig.plugins = [serverActionStubs(), ...(viteConfig.plugins ?? [])];
    return viteConfig;
  },
};

export default config;
