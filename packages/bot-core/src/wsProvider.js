const { ethers } = require("ethers");

class ResilientWsProvider {
  constructor(config, log, { metricsStore = null } = {}) {
    this.config = config;
    this.log = log;
    this.metricsStore = metricsStore;
    this.provider = null;
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.blockHandlers = new Set();
    this.connected = false;
    this.hasConnectedOnce = false;
    this.lastBlock = 0;
  }

  _record(type, payload) {
    if (!this.metricsStore) return;
    try {
      this.metricsStore.record(type, payload);
    } catch {
      /* metrics must never break the ws loop */
    }
  }

  async connect() {
    if (!this.config.wsUrl) {
      throw new Error("WS_URL is required in .env");
    }
    if (this.provider) {
      this.provider.removeAllListeners();
    }
    this.provider = new ethers.providers.WebSocketProvider(this.config.wsUrl);
    this.provider._websocket.on("close", () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this._record("ws_disconnected", { lastBlock: this.lastBlock });
      }
      this._scheduleReconnect();
    });
    this.provider._websocket.on("error", (err) => {
      this.log.warn({ err: err.message }, "ws error");
    });
    this.provider.on("block", (blockNumber) => {
      this.lastBlock = blockNumber;
      for (const fn of this.blockHandlers) fn(blockNumber);
    });
    this._startHealthCheck();
    const net = await this.provider.getNetwork();
    this.connected = true;
    if (this.hasConnectedOnce) {
      this._record("ws_reconnected", { chainId: net.chainId });
    }
    this.hasConnectedOnce = true;
    this.log.info(
      { chainId: net.chainId, wsUrl: this.config.wsUrl },
      "ws connected"
    );
    return this.provider;
  }

  onBlock(handler) {
    this.blockHandlers.add(handler);
  }

  getProvider() {
    if (!this.provider) throw new Error("WS provider not connected");
    return this.provider;
  }

  getStatus() {
    return {
      connected: this.connected,
      lastBlock: this.lastBlock,
    };
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.provider) {
      this.provider.removeAllListeners();
      try {
        this.provider._websocket.close();
      } catch {
        /* ignore */
      }
      this.provider = null;
    }
    this.connected = false;
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.log.warn("ws closed, reconnecting in 3s");
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        this.log.error({ err: err.message }, "ws reconnect failed");
        this._record("ws_reconnect_failed", { error: err.message });
        this._scheduleReconnect();
      }
    }, 3000);
  }

  _startHealthCheck() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(async () => {
      try {
        await this.provider.getBlockNumber();
      } catch (err) {
        this.log.warn({ err: err.message }, "ws health check failed");
        this.connected = false;
        this._scheduleReconnect();
      }
    }, this.config.wsHealthIntervalMs);
  }
}

module.exports = { ResilientWsProvider };
