const crypto = require("crypto");

const SESSION_TTL_MS = parseInt(
  process.env.SESSION_TTL_MS || String(24 * 60 * 60 * 1000),
  10
);

/** @type {Map<string, { createdAt: number }>} */
const sessions = new Map();

/** @type {Map<string, { count: number, resetAt: number }>} */
const loginAttempts = new Map();

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/health"]);

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, meta] of sessions) {
    if (now - meta.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}

function checkLoginRate(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

function login(password, expectedPassword, ip) {
  pruneSessions();
  if (!checkLoginRate(ip)) {
    return { error: "too_many_attempts" };
  }
  if (!password || !timingSafeEqual(password, expectedPassword)) {
    return null;
  }
  const token = createToken();
  sessions.set(token, { createdAt: Date.now() });
  return { token };
}

function validateSession(token) {
  pruneSessions();
  if (!token || !sessions.has(token)) return false;
  const meta = sessions.get(token);
  if (Date.now() - meta.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function authMiddleware() {
  return (req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) return next();

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!validateSession(token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

function clearSessions() {
  sessions.clear();
  loginAttempts.clear();
}

module.exports = {
  login,
  authMiddleware,
  clearSessions,
  validateSession,
  PUBLIC_PATHS,
};
