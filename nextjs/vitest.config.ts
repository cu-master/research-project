import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests run via vitest.integration.config.ts; keep the default
    // `npm test` a pure unit run so it doesn't try to start Docker/testcontainers.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
