import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { LiveFeedPanel } from "../components/LiveFeedPanel";

function StatusBadge({ bot }) {
  const running = bot.runtime?.running;
  const ok = bot.health?.ok;
  if (running && ok) return <span className="badge ok">RUNNING</span>;
  if (running) return <span className="badge warn">UP / DEGRADED</span>;
  return <span className="badge err">STOPPED</span>;
}

export default function OverviewPage() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connected, events, botsSnapshot } = useLiveFeed({ maxEvents: 30 });

  useEffect(() => {
    api("/bots")
      .then(setBots)
      .finally(() => setLoading(false));
    const t = setInterval(() => api("/bots").then(setBots), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (botsSnapshot?.bots) setBots(botsSnapshot.bots);
  }, [botsSnapshot]);

  if (loading) return <p className="muted">Загрузка…</p>;

  return (
    <div>
      <h2>Overview</h2>
      <p className="muted">Статус всех ботов V2–V5</p>
      <div className="card-grid" style={{ marginTop: "1.5rem" }}>
        {bots.map((bot) => (
          <div className="card" key={bot.id}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>{bot.label}</h3>
              <StatusBadge bot={bot} />
            </div>
            <p className="muted">
              Contract: {bot.contract ? `${bot.contract.slice(0, 10)}…` : "—"}
            </p>
            <p className="muted">
              DRY_RUN: {bot.dryRun ? "true" : "false"} · Block:{" "}
              {bot.stats?.lastBlock || "—"}
            </p>
            <div className="stat-row">
              <div className="stat">
                <div className="value">{bot.stats?.opportunitiesFound ?? 0}</div>
                <div className="label">Opportunities</div>
              </div>
              <div className="stat">
                <div className="value">{bot.stats?.bundlesIncluded ?? 0}</div>
                <div className="label">Included</div>
              </div>
            </div>
            <Link to={`/bots/${bot.id}`}>Управление →</Link>
          </div>
        ))}
      </div>

      <LiveFeedPanel connected={connected} events={events} title="Live feed (all bots)" />
    </div>
  );
}
