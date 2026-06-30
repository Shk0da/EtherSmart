function fmtUsdc(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `$${Math.round(n / 1e6).toLocaleString("en-US")}`;
}

function ScanSpread({ payload }) {
  const comps = payload.comparisons || [];
  return (
    <div style={{ marginTop: "0.2rem" }}>
      <div className="muted" style={{ fontSize: "0.85em" }}>
        quotes seen: {payload.quotesSeen ?? "?"} · pairs compared: {comps.length}
      </div>
      <table style={{ width: "100%", fontSize: "0.85em", marginTop: "0.2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", opacity: 0.6 }}>
            <th>pair</th>
            <th>direction</th>
            <th style={{ textAlign: "right" }}>spread</th>
            <th style={{ textAlign: "right" }}>shortfall</th>
            <th style={{ textAlign: "right" }}>loan</th>
          </tr>
        </thead>
        <tbody>
          {comps.map((c, i) => {
            const profitable = Number(c.spreadBps) > 0;
            return (
              <tr key={i}>
                <td>{c.pair}</td>
                <td>{c.direction}</td>
                <td
                  style={{
                    textAlign: "right",
                    color: profitable ? "#3fb950" : "#f85149",
                  }}
                >
                  {c.spreadBps > 0 ? "+" : ""}
                  {c.spreadBps} bps
                </td>
                <td style={{ textAlign: "right" }}>
                  {c.shortfallBps != null ? `${c.shortfallBps} bps` : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{fmtUsdc(c.loan) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LiveFeedPanel({ connected, events, title = "Live feed" }) {
  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>{title}</h3>
        <span className={`badge ${connected ? "ok" : "warn"}`}>
          {connected ? "WS live" : "WS reconnecting…"}
        </span>
      </div>
      <div className="log-box" style={{ maxHeight: 320 }}>
        {events.length === 0 && (
          <span className="muted">Ожидание событий…</span>
        )}
        {events.map((e, i) => {
          const kind = e.event?.type || e.type;
          const payload = e.event?.payload || {};
          const ts = e.event?.ts || e.ts || "";
          const isSpread =
            kind === "scan_spread" && Array.isArray(payload.comparisons);
          return (
            <div
              key={i}
              style={{
                marginBottom: "0.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                paddingBottom: "0.35rem",
              }}
            >
              <div>
                <strong>{kind}</strong>
                {e.botId && ` · ${e.botId}`}
                {payload.block != null && ` · block ${payload.block}`}
                {e.profitFormatted && ` · +${e.profitFormatted} ${e.symbol}`}
                {!isSpread && payload.pair && ` · ${payload.pair}`}
                {!isSpread && payload.bestPair && ` · ${payload.bestPair}`}
                {!isSpread &&
                  payload.bestDirection &&
                  ` ${payload.bestDirection}`}
                {!isSpread &&
                  payload.shortfallBps != null &&
                  ` · shortfall ${payload.shortfallBps} bps`}
                {!isSpread &&
                  payload.quotesSeen != null &&
                  ` · quotes ${payload.quotesSeen}`}
                {payload.signal && ` · ${payload.signal}`}
                {payload.scope && ` · ${payload.scope}`}
                {payload.error &&
                  ` · ${String(payload.error).slice(0, 80)}`}
                {payload.restartCount > 0 &&
                  ` · restart #${payload.restartCount}`}
                {e.txHash && ` · ${e.txHash.slice(0, 10)}…`}
                <span className="muted"> · {ts.slice(11, 19)}</span>
              </div>
              {isSpread && <ScanSpread payload={payload} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
