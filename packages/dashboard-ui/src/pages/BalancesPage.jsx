import { useEffect, useState } from "react";
import { api } from "../api";

export default function BalancesPage() {
  const [bots, setBots] = useState([]);
  const [data, setData] = useState({});

  useEffect(() => {
    api("/bots").then(setBots);
  }, []);

  useEffect(() => {
    for (const b of bots) {
      api(`/bots/${b.id}/balances`)
        .then((bal) => setData((d) => ({ ...d, [b.id]: bal })))
        .catch((e) =>
          setData((d) => ({ ...d, [b.id]: { error: e.message } }))
        );
    }
  }, [bots]);

  return (
    <div>
      <h2>Балансы</h2>
      <p className="muted">
        ETH owner (gas) + accumulatedProfit на контракте. Требуется
        MAINNET_RPC_URL в control-plane.
      </p>

      <div className="card-grid" style={{ marginTop: "1rem" }}>
        {bots.map((bot) => {
          const bal = data[bot.id];
          return (
            <div className="card" key={bot.id}>
              <h3>{bot.label}</h3>
              {!bal && <p className="muted">Загрузка…</p>}
              {bal?.error && <p style={{ color: "var(--err)" }}>{bal.error}</p>}
              {bal && !bal.error && (
                <>
                  <p>
                    ETH owner: <strong>{bal.ethBalanceFormatted}</strong>
                  </p>
                  <p className="muted">
                    Contract: {bal.contract?.slice(0, 12)}…
                  </p>
                  <p className="muted">
                    Paused: {bal.paused ? "yes" : "no"}
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Accumulated</th>
                        <th>On contract</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bal.profits || []).map((p) => (
                        <tr key={p.token}>
                          <td>{p.symbol}</td>
                          <td>{p.accumulatedFormatted}</td>
                          <td>{p.contractBalanceFormatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
