import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import BotPage from "./pages/BotPage";
import DeployPage from "./pages/DeployPage";
import PnlPage from "./pages/PnlPage";
import TradesPage from "./pages/TradesPage";
import BalancesPage from "./pages/BalancesPage";
import AuditPage from "./pages/AuditPage";
import { getToken } from "./api";

// Evaluated by <Routes> on every navigation, so the token set during login is
// picked up immediately. An inline ternary in App would be stale because App
// is rendered once by main.jsx and not re-run on route changes.
function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="bots/:id" element={<BotPage />} />
        <Route path="deploy" element={<DeployPage />} />
        <Route path="pnl" element={<PnlPage />} />
        <Route path="trades" element={<TradesPage />} />
        <Route path="balances" element={<BalancesPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}
