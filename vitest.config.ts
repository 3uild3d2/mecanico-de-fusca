import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberadamente separado de vite.config.ts: os testes cobrem lógica pura e não
// devem carregar os plugins de SSR/Nitro do TanStack Start.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "avaliacao/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/routeTree.gen.ts"],
    },
  },
});
