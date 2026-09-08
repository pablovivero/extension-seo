import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "src/popup/popup.html"),
        "service-worker": resolve(import.meta.dirname, "src/background/service-worker.ts"),
        "extract-serp": resolve(import.meta.dirname, "src/content/extract-serp.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"]
  }
});
