import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "threads"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
