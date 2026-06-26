import { useEffect, useState } from "react";
import { api } from "../api";

export default function AuditPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api("/audit?limit=100").then(setRows);
    const t = setInterval(() => api("/audit?limit=100").then(setRows), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <h2>Audit log</h2>
      <p className="muted">Действия оператора: start/stop, config, deploy</p>
      <div className="card" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Пусто
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.ts).toLocaleString()}</td>
                <td>{r.action}</td>
                <td>{r.target ?? "—"}</td>
                <td className="muted">{JSON.stringify(r.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
