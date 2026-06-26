import { useEffect, useState } from "react";
import { api } from "../api";
import { useLiveFeed } from "../hooks/useLiveFeed";

const BOTS = ["v2", "v3", "v4", "v5"];

export default function TradesPage() {
  const [botId, setBotId] = useState("v5");
  const [trades, setTrades] = useState([]);
  const { connected, events } = useLiveFeed({ botId, maxEvents: 20 });

  function load() {
    api(`/bots/${botId}/trades?limit=100`).then(setTrades);
  }

  useEffect(() => {
    load();
  }, [botId]);

  useEffect(() => {
    const flash = events.find((e) => e.type === "flash_completed");
    if (flash) load();
  }, [events]);

  return (
    <div>
      <h2>Сделки</h2>
      <p className="muted">
        Off-chain bundles + on-chain FlashCompleted{" "}
        <span className={`badge ${connected ? "ok" : "warn"}`}>
          {connected ? "live" : "offline"}
        </span>
      </p>
      <select value={botId} onChange={(e) => setBotId(e.target.value)}>
        {BOTS.map((b) => (
          <option key={b} value={b}>
            {b.toUpperCase()}
          </option>
        ))}
      </select>

      <div className="card" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Источник</th>
              <th>Статус</th>
              <th>Block</th>
              <th>Pair / Token</th>
              <th>Profit</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Нет сделок
                </td>
              </tr>
            )}
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.ts).toLocaleString()}</td>
                <td>{t.source === "onchain" ? "chain" : "bot"}</td>
                <td>
                  <span
                    className={`badge ${
                      t.status === "flash_completed" || t.status === "included"
                        ? "ok"
                        : "warn"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td>{t.block ?? "—"}</td>
                <td>{t.pair ?? t.symbol ?? "—"}</td>
                <td>{t.profitFormatted ?? t.netProfit ?? "—"}</td>
                <td className="muted">
                  {t.txHash ? `${t.txHash.slice(0, 10)}…` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
