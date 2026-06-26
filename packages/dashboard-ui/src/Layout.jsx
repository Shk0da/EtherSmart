import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "./api";
import { useEffect } from "react";

export default function Layout() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("ethersmart_token");
    if (!token) navigate("/login", { replace: true });
  }, [navigate]);

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>EtherSmart</h1>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/bots/v2">V2 Bot</NavLink>
          <NavLink to="/bots/v3">V3 Bot</NavLink>
          <NavLink to="/bots/v4">V4 Bot</NavLink>
          <NavLink to="/bots/v5">V5 Bot</NavLink>
          <NavLink to="/deploy">Deploy</NavLink>
          <NavLink to="/pnl">PnL</NavLink>
          <NavLink to="/trades">Сделки</NavLink>
          <NavLink to="/balances">Балансы</NavLink>
          <NavLink to="/audit">Audit log</NavLink>
        </nav>
        <button
          className="btn secondary"
          style={{ marginTop: "2rem", width: "100%" }}
          onClick={logout}
        >
          Выйти
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
