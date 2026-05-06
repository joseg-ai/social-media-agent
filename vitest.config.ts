import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      // Prevent env.ts from throwing on missing vars during unit tests.
      SKIP_ENV_VALIDATION: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/db": path.resolve(__dirname, "./src/db"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/server": path.resolve(__dirname, "./src/server"),
      "@/jobs": path.resolve(__dirname, "./src/jobs"),
      "@/agents": path.resolve(__dirname, "./src/agents"),
    },
  },
});
