// Opens every story of a built Storybook (storybook-static/) in Chrome and
// fails if one does not render or throws. Run: npm run storybook:check
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = "storybook-static";
const PORT = 6117;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

if (!fs.existsSync(path.join(ROOT, "index.json"))) {
  console.error("Нема storybook-static/. Прво: npm run build-storybook");
  process.exit(1);
}

const server = http
  .createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname));
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
    });
  })
  .listen(PORT);

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter((entry) => entry.type === "story");
const browser = await chromium.launch({ channel: "chrome" });
let failed = 0;

for (const story of stories) {
  const phone = /phone/i.test(story.id);
  const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1360, height: 900 } });
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`http://127.0.0.1:${PORT}/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const crash = await page.evaluate(() =>
    document.body.classList.contains("sb-show-errordisplay") ? (document.querySelector("#error-message")?.textContent ?? "грешка") : null,
  );
  if (crash) problems.push(crash);
  // A page wider than the screen means something sticks out sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) problems.push(`содржината е ${overflow}px поширока од екранот`);
  await page.close();

  if (problems.length) failed += 1;
  console.log(`${problems.length ? "ГРЕШКА" : "ок    "} ${story.title} / ${story.name}${problems.length ? ` — ${problems.join("; ")}` : ""}`);
}

await browser.close();
server.close();
console.log(`\n${stories.length} приказни, ${failed} со грешка.`);
process.exit(failed ? 1 : 0);
