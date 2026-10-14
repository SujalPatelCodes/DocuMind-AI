/**
 * A tiny REST API for the dashboard, mounted at `/api` by Vite.
 *
 * It is wired in as a Vite plugin so both `npm run dev` and `npm run preview`
 * serve the same API from the same origin as the page — no CORS, no second
 * process to start. Backed by SQLite (see ./store.mjs) so data survives a
 * refresh, a server restart and a rebuild.
 *
 * Documents are stored per conversation: `PUT/GET/DELETE
 * /api/conversations/:id/document`. The PDF rides as a raw binary body (no
 * base64), which keeps large files cheap.
 */
import { resolve } from "node:path";
import { createStore } from "./store.mjs";

/* First-run seed — mirrors src/data/mockData.ts so the app looks familiar the
 * very first time it is opened, then lives in SQLite from then on. */
const SEED_CONVERSATIONS = [
  { id: "c1", title: "The Culinary Arts", group: "TODAY" },
  { id: "c2", title: "The Science of Renewable Energy", group: "TODAY" },
  { id: "c3", title: "Unlocking the Secrets of the Universe", group: "TODAY" },
  { id: "c4", title: "The Future of Renewable Energy", group: "TODAY" },
  { id: "c5", title: "Historic Architecture", group: "TODAY" },
  { id: "c6", title: "Biodiversity in the Rainforest", group: "YESTERDAY" },
  { id: "c7", title: "Biodiversity in the Rainforest", group: "YESTERDAY" },
];

const SEED_MESSAGES = {
  c1: [
    {
      id: "m1",
      role: "assistant",
      time: "12:15 PM",
      text:
        "Hello, I am a multilingual document assistant. I am here to assist you " +
        "with any questions you may have regarding your uploaded document.\n\n" +
        "This insightful report provides an in-depth exploration of the latest " +
        "innovations and trends in renewable energy. Highlighting groundbreaking " +
        "technologies and strategies, it paints a picture of a sustainable and " +
        "green future where energy is abundant and clean",
    },
    {
      id: "m2",
      role: "user",
      time: "12:15 PM",
      text: "Tell me more about these innovations",
    },
  ],
};

const MAX_BODY = 64 * 1024 * 1024; // 64 MB — generous headroom for large PDFs

function send(res, status, data) {
  const body = data === undefined ? "" : JSON.stringify(data);
  res.statusCode = status;
  if (body) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(body);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("invalid JSON body");
  }
}

const decode = (value) => decodeURIComponent(value ?? "");

/** Build the request handler. `req.url` is relative to the `/api` mount. */
function createHandler(ensureStore) {
  return async function handleApi(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const seg = url.pathname.split("/").filter(Boolean);
    const method = (req.method ?? "GET").toUpperCase();

    try {
      const store = ensureStore();

      if (method === "GET" && (seg.length === 0 || seg[0] === "health")) {
        return send(res, 200, { ok: true, service: "documind-api" });
      }

      if (method === "GET" && seg.length === 1 && seg[0] === "state") {
        return send(res, 200, store.getState());
      }

      if (method === "POST" && seg.length === 1 && seg[0] === "conversations") {
        const body = await readJson(req);
        if (!body?.id) return send(res, 400, { error: "id is required" });
        store.createConversation(body);
        return send(res, 201, { ok: true });
      }

      if (seg[0] === "conversations" && seg.length >= 2) {
        const convId = decode(seg[1]);

        if (method === "PATCH" && seg.length === 2) {
          const body = await readJson(req);
          const title = typeof body?.title === "string" ? body.title.trim() : "";
          if (!title) return send(res, 400, { error: "title is required" });
          store.renameConversation(convId, title);
          return send(res, 200, { ok: true });
        }

        if (method === "DELETE" && seg.length === 2) {
          store.deleteConversation(convId);
          return send(res, 200, { ok: true });
        }

        if (method === "POST" && seg.length === 3 && seg[2] === "messages") {
          const body = await readJson(req);
          if (!body?.id || !body?.role) {
            return send(res, 400, { error: "id and role are required" });
          }
          store.addMessage(convId, body);
          return send(res, 201, { ok: true });
        }

        if (method === "PATCH" && seg.length === 4 && seg[2] === "messages") {
          const body = await readJson(req);
          store.patchMessage(convId, decode(seg[3]), String(body?.text ?? ""));
          return send(res, 200, { ok: true });
        }

        // ---- the conversation's PDF ----
        if (seg.length === 3 && seg[2] === "document") {
          if (method === "GET") {
            const doc = store.getDocument(convId);
            if (!doc) return send(res, 404, { error: "no document" });
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Length", doc.data.length);
            res.setHeader("X-Document-Name", encodeURIComponent(doc.name));
            res.setHeader("X-Document-Pages", String(doc.numPages));
            res.setHeader("Cache-Control", "no-store");
            return res.end(doc.data);
          }

          if (method === "PUT") {
            const name = url.searchParams.get("name") || "document.pdf";
            const numPages = Number(url.searchParams.get("numPages")) || 0;
            const data = await readBody(req);
            if (!data.length) return send(res, 400, { error: "empty document" });
            store.putDocument(convId, { name, numPages, data });
            return send(res, 200, { ok: true, bytes: data.length });
          }

          if (method === "DELETE") {
            store.deleteDocument(convId);
            return send(res, 200, { ok: true });
          }
        }
      }

      if (method === "PUT" && seg.length === 1 && seg[0] === "settings") {
        const body = await readJson(req);
        if (body?.model !== undefined) store.setSetting("model", String(body.model));
        if (body?.activeConvId !== undefined) {
          store.setSetting("activeConvId", String(body.activeConvId));
        }
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: `no route for ${method} ${url.pathname}` });
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function apiPlugin() {
  const dbPath = resolve(process.cwd(), "data", "documind.db");
  let store = null;

  const ensureStore = () => {
    if (!store) {
      store = createStore(dbPath, {
        conversations: SEED_CONVERSATIONS,
        messages: SEED_MESSAGES,
      });
      store.seedIfEmpty();
    }
    return store;
  };

  const mount = (server) => {
    ensureStore();
    server.middlewares.use("/api", createHandler(ensureStore));
  };

  return {
    name: "documind-api",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
