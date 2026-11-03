import { defineConfig } from "vitest/config";

// npm run test:integracion: necesitan OpenTofu y el emulador en AWS_ENDPOINT.
export default defineConfig({
  test: {
    include: ["test/integracion/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
