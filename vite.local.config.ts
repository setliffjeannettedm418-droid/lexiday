import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "dist-local" },
  server: { host: "0.0.0.0", proxy: { "/exam-source/kaoyan/": { target: "https://downloads.lazynote.cn", changeOrigin: true, rewrite: path => path.replace(/^\/exam-source/, "") } } },
  preview: { host: "0.0.0.0" },
});
