import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const url = "https://chatgpt.com/share/6a6f93f6-abe8-83ed-b314-f752dc82d5cf";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(4000);
// Try the embedded JSON payload first — cleanest source.
const nextData = await p.evaluate(() => {
  const el = document.querySelector("#__NEXT_DATA__");
  return el ? el.textContent : null;
});
const text = await p.evaluate(() => document.body.innerText);
await b.close();
await writeFile("/tmp/chat-body.txt", text);
if (nextData) await writeFile("/tmp/chat-next.json", nextData);
console.log("bodyChars", text.length, "| nextData", nextData ? nextData.length : 0);
console.log(text.slice(0, 1500));
