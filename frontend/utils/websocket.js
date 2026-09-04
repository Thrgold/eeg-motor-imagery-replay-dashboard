// utils/websocket.js — Real-backend WebSocket client.
//
// Behaviour follows the spec § 4 + § 6.3:
//   • Opens ws://… , sends `hello` on open.
//   • Dispatches inbound messages by `type` via on(type, fn).
//   • Status states: 'connecting' | 'connected' | 'reconnecting' |
//     'disconnected' | 'failed'.
//   • Auto-reconnect on close: 2 s interval, max 5 retries. After 5 failed
//     attempts emits a synthetic `error` message so the UI can show the
//     standard error dialog.
//   • disconnect() cancels reconnect.
//   • Same shape as MockBackend so the data-stream layer can swap them.

(function () {
  const RECONNECT_DELAY_MS = 2000;
  const MAX_RETRIES = 5;
  const HANDSHAKE_TIMEOUT_MS = 4000;

  class BackendClient {
    constructor({ url, version = '1.0' } = {}) {
      this.url = url;
      this.version = version;
      this.ws = null;
      this.status = 'disconnected';
      this.retries = 0;
      this.maxRetries = MAX_RETRIES;
      this.retryDelayMs = RECONNECT_DELAY_MS;
      this.handlers = {
        hello_ack: [], raw: [], preprocessed: [], band_power: [],
        classification: [], status: [], error: [], _status_change: [],
      };
      this.reconnectTimer = null;
      this.handshakeTimer = null;
      this.shouldReconnect = true;
      this.kind = 'websocket';
    }

    on(type, fn) {
      if (!this.handlers[type]) this.handlers[type] = [];
      this.handlers[type].push(fn);
      return this;
    }

    _setStatus(s, info) {
      if (this.status === s) return;
      this.status = s;
      (this.handlers._status_change || []).forEach(fn => {
        try { fn(s, info || {}); } catch (e) { console.error(e); }
      });
    }

    _dispatch(msg) {
      const t = msg && msg.type;
      if (!t) return;
      const list = this.handlers[t] || [];
      list.forEach(fn => {
        try { fn(msg); } catch (e) { console.error(e); }
      });
    }

    connect() {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN ||
                      this.ws.readyState === WebSocket.CONNECTING)) return;
      this.shouldReconnect = true;
      this._setStatus(
        this.retries === 0 ? 'connecting' : 'reconnecting',
        { attempt: this.retries + 1, maxRetries: this.maxRetries }
      );
      let ws;
      try { ws = new WebSocket(this.url); }
      catch (e) {
        console.warn('[BackendClient] new WebSocket() threw', e);
        this._scheduleReconnect();
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({
            type: 'hello', client: 'frontend', version: this.version,
          }));
        } catch (e) { /* swallow */ }
        // Wait for hello_ack before declaring 'connected'.
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = setTimeout(() => {
          // Handshake didn't complete — force a close, which triggers reconnect.
          console.warn('[BackendClient] hello_ack timeout');
          try { ws.close(); } catch (e) {}
        }, HANDSHAKE_TIMEOUT_MS);
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); }
        catch (e) {
          console.warn('[BackendClient] bad JSON from backend, ignoring', e);
          return;
        }
        if (msg && msg.type === 'hello_ack') {
          clearTimeout(this.handshakeTimer);
          this.retries = 0;
          this._setStatus('connected');
        }
        this._dispatch(msg);
      };

      ws.onerror = () => {
        // Per WS spec the browser also fires `close` right after — let that
        // path handle reconnect.
      };

      ws.onclose = () => {
        clearTimeout(this.handshakeTimer);
        if (this.shouldReconnect) this._scheduleReconnect();
        else this._setStatus('disconnected');
      };
    }

    _scheduleReconnect() {
      if (this.retries >= this.maxRetries) {
        this._setStatus('failed');
        this._dispatch({
          type: 'error',
          code: 'MAX_RETRIES_EXCEEDED',
          message: '已达到最大重连次数（5 次）。请检查后端服务是否启动。',
        });
        return;
      }
      this.retries++;
      this._setStatus('reconnecting', {
        attempt: this.retries, maxRetries: this.maxRetries,
      });
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), this.retryDelayMs);
    }

    // Force a fresh connection attempt (resets retry counter).
    retry() {
      this.retries = 0;
      clearTimeout(this.reconnectTimer);
      this.disconnect();
      this.shouldReconnect = true;
      this.connect();
    }

    disconnect() {
      this.shouldReconnect = false;
      clearTimeout(this.reconnectTimer);
      clearTimeout(this.handshakeTimer);
      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
        this.ws = null;
      }
      this._setStatus('disconnected');
    }
  }

  window.BackendClient = BackendClient;
})();
