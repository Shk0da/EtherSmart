const { WebSocketServer } = require("ws");
const { validateSession } = require("./auth");

function createLiveFeed(server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });
  const clients = new Set();

  wss.on("connection", (ws, req) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const token = url.searchParams.get("token");
    if (!validateSession(token)) {
      ws.close(4401, "unauthorized");
      return;
    }
    clients.add(ws);
    ws.send(
      JSON.stringify({ type: "connected", ts: new Date().toISOString() })
    );
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  function broadcast(message) {
    const data = JSON.stringify({
      ...message,
      ts: message.ts || new Date().toISOString(),
    });
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(data);
    }
  }

  function close() {
    for (const ws of clients) ws.close();
    wss.close();
  }

  return { broadcast, close, clientCount: () => clients.size };
}

module.exports = { createLiveFeed };
