import { useEffect, useState } from "react";
import { api } from "../api";

const VERSIONS = ["v2", "v3", "v4", "v5"];

export default function DeployPage() {
  const [version, setVersion] = useState("v5");
  const [jobs, setJobs] = useState([]);
  const [bots, setBots] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function loadJobs() {
    api("/deploy/jobs").then(setJobs);
  }

  function loadBots() {
    api("/bots").then(setBots);
  }

  useEffect(() => {
    loadJobs();
    loadBots();
  }, []);

  useEffect(() => {
    if (!activeJob || activeJob.status !== "running") return;
    const t = setInterval(async () => {
      const j = await api(`/deploy/jobs/${activeJob.id}`);
      setActiveJob(j);
      if (j.status !== "running") {
        loadJobs();
        loadBots();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [activeJob]);

  async function deploy() {
    setBusy(true);
    setError("");
    try {
      const job = await api("/deploy", {
        method: "POST",
        body: JSON.stringify({ version, compileFirst: true }),
      });
      const detail = await api(`/deploy/jobs/${job.id}`);
      setActiveJob(detail);
      loadJobs();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const botById = Object.fromEntries(bots.map((b) => [b.id, b]));
  const selectedContract = botById[version]?.contract;

  return (
    <div>
      <h2>Deploy</h2>
      <p className="muted">
        Запуск compile + deploy. Требуется DEPLOYER_PK в vX/.env на сервере.
      </p>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Текущие контракты (ARB_CONTRACT)</h3>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            {VERSIONS.map((v) => {
              const c = botById[v]?.contract;
              return (
                <tr key={v}>
                  <td>{v.toUpperCase()}</td>
                  <td className="muted">
                    {c ? (
                      <code>{c}</code>
                    ) : (
                      <span style={{ color: "var(--warn)" }}>не задеплоен</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ maxWidth: 480, marginTop: "1rem" }}>
        <label>
          Версия
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Текущий контракт:{" "}
          {selectedContract ? (
            <code>{selectedContract}</code>
          ) : (
            "не задеплоен"
          )}
        </p>
        <button
          className="btn"
          style={{ marginTop: "1rem" }}
          disabled={busy}
          onClick={deploy}
        >
          Deploy
        </button>
        {error && <p style={{ color: "var(--err)" }}>{error}</p>}
      </div>

      {activeJob && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3>
            Job {activeJob.id.slice(0, 8)} — {activeJob.status}
          </h3>
          <div className="log-box">{activeJob.log.join("\n") || "…"}</div>
        </div>
      )}

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>История jobs</h3>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.version}</td>
                <td>{j.status}</td>
                <td>{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
