import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "extract-serp": resolve(__dirname, "src/content/extract-serp.ts")
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
