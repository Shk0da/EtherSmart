import { useEffect, useState } from "react";
import { api } from "../api";

const BOTS = ["v2", "v3", "v4", "v5"];

export default function PnlPage() {
  const [botId, setBotId] = useState("v5");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api(`/bots/${botId}/pnl?days=30`).then(setRows);
  }, [botId]);

  return (
    <div>
      <h2>PnL — история дохода</h2>
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
              <th>День</th>
              <th>Opportunities</th>
              <th>Sim OK</th>
              <th>Included</th>
              <th>Flash (on-chain)</th>
              <th>On-chain profit (raw)</th>
              <th>Off-chain net (raw)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Нет данных
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.day}>
                <td>{r.day}</td>
                <td>{r.opportunities ?? 0}</td>
                <td>{r.simulationsOk ?? 0}</td>
                <td>{r.bundlesIncluded ?? 0}</td>
                <td>{r.flashCount ?? 0}</td>
                <td>{r.onChainProfitWei ?? "0"}</td>
                <td>{r.netProfitWei ?? "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: "1rem" }}>
          onChainProfitWei — сумма FlashCompleted.profit из indexer. netProfitWei —
          off-chain оценка из opportunities.
        </p>
      </div>
    </div>
  );
}
