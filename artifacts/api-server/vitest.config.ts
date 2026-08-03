import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: ["verbose"],
    // Provide a fake DATABASE_URL so @workspace/db module loads without throwing.
    // Tests that use GameService pure-static methods (snapshotToRoundState,
    // buildValidActions, buildClientGameState) never actually execute DB queries.
    env: {
      DATABASE_URL: "postgresql://localhost/chhakri_vitest_unit_tests",
    },
  },
});
