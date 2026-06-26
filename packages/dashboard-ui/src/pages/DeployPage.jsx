import { useEffect, useState } from "react";
import { api } from "../api";

const VERSIONS = ["v2", "v3", "v4", "v5"];

export default function DeployPage() {
  const [version, setVersion] = useState("v5");
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function loadJobs() {
    api("/deploy/jobs").then(setJobs);
  }

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (!activeJob || activeJob.status !== "running") return;
    const t = setInterval(async () => {
      const j = await api(`/deploy/jobs/${activeJob.id}`);
      setActiveJob(j);
      if (j.status !== "running") loadJobs();
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

  return (
    <div>
      <h2>Deploy</h2>
      <p className="muted">
        Запуск compile + deploy. Требуется DEPLOYER_PK в vX/.env на сервере.
      </p>

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
