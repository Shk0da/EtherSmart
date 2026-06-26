export function LiveFeedPanel({ connected, events, title = "Live feed" }) {
  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>{title}</h3>
        <span className={`badge ${connected ? "ok" : "warn"}`}>
          {connected ? "WS live" : "WS reconnecting…"}
        </span>
      </div>
      <div className="log-box" style={{ maxHeight: 220 }}>
        {events.length === 0 && (
          <span className="muted">Ожидание событий…</span>
        )}
        {events.map((e, i) => (
          <div key={i} style={{ marginBottom: "0.35rem" }}>
            <strong>{e.type}</strong>
            {e.botId && ` · ${e.botId}`}
            {e.event?.type && ` · ${e.event.type}`}
            {e.profitFormatted && ` · +${e.profitFormatted} ${e.symbol}`}
            {e.event?.payload?.pair && ` · ${e.event.payload.pair}`}
            {e.txHash && ` · ${e.txHash.slice(0, 10)}…`}
            <span className="muted">
              {" "}
              · {e.ts?.slice(11, 19) || ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
