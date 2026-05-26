import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import("playwright");
const { chromium } = playwright;

const outputRoot = process.argv[2] ?? "docs/ui-screenshots/before";
const baseAppUrl = process.env.AMBER_CAPTURE_URL ?? "http://127.0.0.1:5173/";
const appUrl = `${baseAppUrl}${baseAppUrl.includes("?") ? "&" : "?"}capture=${Date.now()}`;
const fixtureScript = await readFile("scripts/capture-fixture.js", "utf8");

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({
  args: ["--single-process", "--no-zygote", "--disable-gpu-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  colorScheme: "light",
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
});
await context.addInitScript(fixtureScript);

const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") {
    console.error(`browser console error: ${message.text()}`);
  }
});

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell");
  await page.screenshot({ path: path.join(outputRoot, "desktop-items.png"), fullPage: true });

  await page.getByRole("button", { name: /新增商品/ }).click();
  await page.screenshot({ path: path.join(outputRoot, "desktop-form.png"), fullPage: true });

  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: /提醒/ }).click();
  await page.screenshot({ path: path.join(outputRoot, "desktop-reminders.png"), fullPage: true });

  await page.getByRole("button", { name: "设置" }).click();
  await page.screenshot({ path: path.join(outputRoot, "desktop-settings.png"), fullPage: true });

  await page.getByRole("button", { name: "商品", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputRoot, "mobile-items.png"), fullPage: true });
} finally {
  await browser.close();
}
