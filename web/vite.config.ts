/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Entorno de trabajo para Tauri: sin puerto fijo y sin "cleanUrls".
export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    host: "0.0.0.0"
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
