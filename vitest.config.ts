import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "worker/**/*.test.js",
      "scripts/**/*.test.mjs",
    ],
    globals: false,
  },
});
