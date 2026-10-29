import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@plandosee/shared": path.resolve(__dirname, "./packages/shared/src"),
      "@api": path.resolve(__dirname, "./apps/api/src"),
    },
  },
});

