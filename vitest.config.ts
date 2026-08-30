import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    // Fake env values so lib/env.ts (parsed at module-init time via zod)
    // succeeds during test collection. These are obviously non-real values
    // used only inside the test process — never commit real secrets here.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/lunchpad_test",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "test-secret-thirty-two-chars-min-x",
      APP_BASE_URL: "http://localhost:3000",
      MFA_ENCRYPTION_KEY: "0".repeat(64)
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
