import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.join(__dirname, "fixtures/sample.pdf");
const SAMPLE_PNG = path.join(__dirname, "fixtures/sample.png");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("folio_lead_ok", "1"));
  await page.reload();
});

async function openTool(page, label) {
  await page.locator(".tool-card", { hasText: label }).click();
}

test("la cuadrícula del inicio muestra las 10 herramientas", async ({ page }) => {
  await expect(page.locator(".tool-card")).toHaveCount(10);
});

test("Unir PDF: sube dos archivos y descarga el resultado", async ({ page }) => {
  await openTool(page, "UNIR PDF");
  await page.setInputFiles('input[type="file"]', [SAMPLE_PDF, SAMPLE_PDF]);
  await page.locator("main").getByRole("button", { name: "Unir PDF" }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Descargar/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("unido-folio.pdf");
  // Debe quedar en cero tras descargar.
  await expect(page.getByText("Aún no has agregado archivos.")).toBeVisible();
});

test("Organizar páginas: rotar, extraer una página y guardar", async ({ page }) => {
  await openTool(page, "ORGANIZAR PÁGINAS");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await expect(page.getByText("páginas — reordena")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Rotar 90°" }).first().click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Dividir PDF: divide y descarga", async ({ page }) => {
  await openTool(page, "DIVIDIR PDF");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await expect(page.getByText("El PDF tiene")).toBeVisible({ timeout: 10000 });
  await page.locator("main").getByRole("button", { name: "Dividir PDF" }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Imágenes a PDF: sube una imagen, rota, y descarga", async ({ page }) => {
  await openTool(page, "IMÁGENES A PDF");
  await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
  await page.getByRole("button", { name: "Rotar 90°" }).click();
  await page.getByRole("button", { name: /Convertir a PDF/ }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("PDF a Imágenes: convierte una página seleccionada", async ({ page }) => {
  await openTool(page, "PDF A IMÁGENES");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await expect(page.getByText("páginas — elige cuáles convertir")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Convertir/ }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Comprimir PDF: sube y comprime", async ({ page }) => {
  await openTool(page, "COMPRIMIR PDF");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await page.getByRole("button", { name: "Comprimir", exact: true }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Rotar PDF: gira todo el documento", async ({ page }) => {
  await openTool(page, "ROTAR PDF");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await expect(page.getByText("El PDF tiene")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Girar 90/ }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Tachar información: dibuja un tachón y genera el PDF", async ({ page }) => {
  await openTool(page, "TACHAR INFORMACIÓN");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  const area = page.locator("div[style*='crosshair']");
  await expect(area.locator("img")).toBeVisible({ timeout: 10000 });
  const box = await area.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 80, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: /Tachar y generar PDF/ }).click();
  await expect(page.getByText("Tu archivo está listo")).toBeVisible({ timeout: 10000 });
});

test("Extraer texto: muestra el texto extraído y permite descargarlo", async ({ page }) => {
  await openTool(page, "EXTRAER TEXTO");
  await page.setInputFiles('input[type="file"]', SAMPLE_PDF);
  await expect(page.locator("textarea")).toBeVisible({ timeout: 10000 });
  const contenido = await page.locator("textarea").inputValue();
  expect(contenido).toContain("Documento de prueba");
});

test("el scroll sube al inicio al cambiar de herramienta desde el pie de página", async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator(".footer-link", { hasText: "Unir PDF" }).click();
  await page.waitForTimeout(600);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeLessThan(50);
});
