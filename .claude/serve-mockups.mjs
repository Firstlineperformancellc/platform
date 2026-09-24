// Tiny static server for docs/mockups so the browser pane can render them (python's http.server is sandboxed out).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const root = join(process.cwd(), "docs", "mockups");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = join(root, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(8099, "127.0.0.1", () => console.log("mockups on http://127.0.0.1:8099"));
