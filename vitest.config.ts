import { defineConfig } from "vitest/config";

// npm test: pruebas rápidas, sin emulador ni modelo.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integracion/**", "node_modules/**"],
  },
});
