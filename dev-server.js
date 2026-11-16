// Local test server: serves index.html and runs the two /api routes the same way the host does.
// Usage: ANTHROPIC_API_KEY=... node dev-server.js   (optional: FACECHECK_API_TOKEN, PORT)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";

const routes = {
  "/api/scan-name": () => import("./api/scan-name.js"),
  "/api/scan-face": () => import("./api/scan-face.js"),
};
const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    if (routes[path]) {
      if (req.method !== "POST") { res.writeHead(405).end(); return; }
      const { POST } = await routes[path]();
      const out = await POST(new Request(`http://localhost${path}`, {
        method: "POST", headers: req.headers, body: Readable.toWeb(req), duplex: "half",
      }));
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      console.log(path, out.status);
      return;
    }
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(new URL("./index.html", import.meta.url)));
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (err) {
    console.error(path, err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "The server hit an error. Check its log." }));
  }
}).listen(port, () => console.log(`Footprint Check running on http://localhost:${port}`));
