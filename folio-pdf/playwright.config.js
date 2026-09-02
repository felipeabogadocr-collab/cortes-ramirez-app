import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5678",
    trace: "retain-on-failure",
    // En CI/sandboxes sin el binario "headless shell" de Playwright, usar el
    // Chromium ya instalado si está disponible en esta ruta conocida.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev -- --port 5678 --strictPort",
    url: "http://localhost:5678",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
