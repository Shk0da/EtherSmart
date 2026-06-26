import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setToken(token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={submit}>
        <h2>EtherSmart</h2>
        <p className="muted">Control Panel</p>
        <input
          type="password"
          placeholder="Dashboard password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p style={{ color: "var(--err)" }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
