import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { LiveFeedPanel } from "../components/LiveFeedPanel";

export default function BotPage() {
  const { id } = useParams();
  const [bot, setBot] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [busy, setBusy] = useState(false);
  const { connected, events } = useLiveFeed({ botId: id, maxEvents: 40 });

  const load = useCallback(() => {
    api(`/bots/${id}`).then(setBot);
    api(`/bots/${id}/metrics?limit=30`).then(setMetrics);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function action(name) {
    setBusy(true);
    try {
      await api(`/bots/${id}/${name}`, { method: "POST" });
      await new Promise((r) => setTimeout(r, 1500));
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!bot) return <p className="muted">Загрузка…</p>;

  return (
    <div>
      <h2>{bot.label}</h2>
      <p className="muted">
        {bot.runtime?.mode} · {bot.runtime?.state} · health:{" "}
        {bot.health?.ok ? "ok" : "fail"}
      </p>

      <div style={{ margin: "1rem 0" }}>
        <button className="btn" disabled={busy} onClick={() => action("start")}>
          Start
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={() => action("stop")}
        >
          Stop
        </button>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => action("restart")}
        >
          Restart
        </button>
      </div>

      {bot.stats && (
        <div className="card">
          <h3>Live stats</h3>
          <div className="stat-row">
            <div className="stat">
              <div className="value">{bot.stats.blocksScanned}</div>
              <div className="label">Blocks</div>
            </div>
            <div className="stat">
              <div className="value">{bot.stats.opportunitiesFound}</div>
              <div className="label">Opportunities</div>
            </div>
            <div className="stat">
              <div className="value">{bot.stats.bundlesSimulated}</div>
              <div className="label">Simulated</div>
            </div>
            <div className="stat">
              <div className="value">{bot.stats.simulationFailures}</div>
              <div className="label">Sim failures</div>
            </div>
          </div>
        </div>
      )}

      <LiveFeedPanel connected={connected} events={events} />

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Recent events (poll)</h3>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id}>
                <td>{m.ts.slice(11, 19)}</td>
                <td>{m.type}</td>
                <td className="muted">
                  {m.payload.pair || m.payload.block || m.payload.error || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfigSection id={id} />
    </div>
  );
}

function ConfigSection({ id }) {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api(`/bots/${id}/config`).then((c) => {
      setCfg(c);
      setDraft(c.values);
    });
  }, [id]);

  async function save() {
    const updates = {};
    for (const key of cfg.editable) {
      if (draft[key] !== cfg.values[key]) updates[key] = draft[key];
    }
    if (Object.keys(updates).length === 0) {
      setMsg("Нет изменений");
      return;
    }
    const updated = await api(`/bots/${id}/config`, {
      method: "PUT",
      body: JSON.stringify({ updates }),
    });
    setCfg(updated);
    setDraft(updated.values);
    setMsg("Сохранено. Перезапустите бота для применения.");
  }

  if (!cfg) return null;

  const keys = [
    "DRY_RUN",
    "LOAN_SIZES_USDC",
    "SLIPPAGE_BPS",
    "MIN_PROFIT_BPS",
    "BUILDER_TIP_WEI",
    "MAX_GAS_PRICE_GWEI",
    "ESTIMATED_ARB_GAS",
    "MULTI_BLOCK_TARGETS",
    "FLASH_SOURCE",
    "USE_MEMPOOL",
    "ARB_CONTRACT",
  ].filter((k) => k in draft || cfg.editable.includes(k));

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <h3>Конфигурация</h3>
      <div className="form-grid">
        {keys.map((key) => (
          <label key={key}>
            {key}
            <input
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <button className="btn" style={{ marginTop: "1rem" }} onClick={save}>
        Сохранить
      </button>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
