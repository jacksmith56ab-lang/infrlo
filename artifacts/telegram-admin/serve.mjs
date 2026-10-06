import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import app from "../api-server/dist/app.mjs";

const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be set to a valid listening port.");
}

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "dist/public",
);

if (!existsSync(path.join(root, "index.html"))) {
  throw new Error(
    "Frontend build is missing. Run the build command before start.",
  );
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    app(request, response);
    return;
  }

  const candidate = path.resolve(root, `.${pathname}`);

  if (
    candidate !== root &&
    !candidate.startsWith(`${root}${path.sep}`)
  ) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const file =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : path.join(root, "index.html");

  response.writeHead(200, {
    "Content-Type":
      contentTypes[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control":
      path.basename(file) === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(file).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(
    `BotDesk full stack listening on 0.0.0.0:${port}\n`,
  );
});