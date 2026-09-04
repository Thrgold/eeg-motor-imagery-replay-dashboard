// utils/mock-backend.js — In-browser mock backend.
//
// Implements the *same shape* as BackendClient (connect / disconnect / on(type))
// but generates messages locally, conforming to the WS contract in spec § 4:
//   • hello_ack on connect
//   • raw + preprocessed @ 25 Hz, chunks of 10 samples × 32 channels
//   • band_power @ 5 Hz (mu, beta)
//   • classification @ ~3 Hz
//   • status updates
//
// Per spec § 10 the production frontend should not generate mocks; this file is
// loaded only as a fallback so the dashboard remains demonstrable without a
// running backend. The data-stream layer prefers a real WebSocket if reachable.

(function () {
  // Channel order matches utils/electrodes.js → BioSemi 32 / Easycap M10.
  const CHANNEL_NAMES = window.DEFAULT_CHANNEL_NAMES || [
    'Fp1','AF3','F7','F3','FC1','FC5','T7','C3','CP1','CP5','P7','P3','Pz',
    'PO3','O1','Oz','O2','PO4','P4','P8','CP6','CP2','C4','T8','FC6','FC2',
    'F4','F8','AF4','Fp2','Fz','Cz',
  ];
  // Experiment paradigm: 开掌 / 抓笔 / OK 手势 / 搓指.
  const CLASSES = ['palm', 'fist', 'ok', 'invert'];
  const SAMPLE_RATE = 250;
  const CHUNK_SAMPLES = 10;       // 10 samples / chunk → 25 Hz
  const RAW_INTERVAL_MS = 40;
  const BAND_INTERVAL_MS = 200;   // 5 Hz
  const CLF_INTERVAL_MS = 3000;   // 每 3 s 推送一次分类结果 (≈0.33 Hz)

  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class MockBackend {
    constructor() {
      this.handlers = {
        hello_ack: [], raw: [], preprocessed: [], band_power: [],
        classification: [], status: [], error: [], _status_change: [],
      };
      this.status = 'disconnected';
      this.intervals = [];
      this.t0 = 0;
      this.sampleCounter = 0;
      this.currentClass = 'palm';
      this.rng = mulberry32(2025);
      this.kind = 'mock';
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
      const list = this.handlers[msg.type] || [];
      list.forEach(fn => { try { fn(msg); } catch (e) { console.error(e); } });
    }

    setCurrentClass(c) {
      if (CLASSES.includes(c)) this.currentClass = c;
    }

    // Allow the host app to inject a fake error (e.g. for QA of the dialog).
    injectError(message, code) {
      this._dispatch({ type: 'error', message: message || '模拟错误', code: code || 'MOCK_ERROR' });
    }

    connect() {
      if (this.status === 'connected' || this.status === 'connecting') return;
      this._setStatus('connecting');
      setTimeout(() => {
        this._setStatus('connected');
        this._dispatch({
          type: 'hello_ack',
          sample_rate: SAMPLE_RATE,
          n_channels: CHANNEL_NAMES.length,
          channel_names: CHANNEL_NAMES,
          classes: CLASSES,
        });
        this._dispatch({
          type: 'status', state: 'running',
          message: '采集中（浏览器内置模拟数据）',
        });
        this.t0 = Date.now() / 1000;
        this.sampleCounter = 0;
        this._startStreams();
      }, 120);
    }

    _startStreams() {
      this.intervals.push(setInterval(() => this._emitDataChunks(), RAW_INTERVAL_MS));
      this.intervals.push(setInterval(() => this._emitBandPower(),  BAND_INTERVAL_MS));
      this.intervals.push(setInterval(() => this._emitClassification(), CLF_INTERVAL_MS));
    }

    // Emit one raw chunk and the time-aligned preprocessed chunk.
    _emitDataChunks() {
      const ts = this.t0 + this.sampleCounter / SAMPLE_RATE;
      const raw = new Array(CHANNEL_NAMES.length);
      const pre = new Array(CHANNEL_NAMES.length);
      // Contralateral motor cortex ERD when imagining a movement (all
      // paradigm classes are active gestures, so always engaged).
      const erdBias = 0.7;

      for (let c = 0; c < CHANNEL_NAMES.length; c++) {
        const e = window.ELECTRODES_32 ? window.ELECTRODES_32[c] : { x: 0, y: 0, label: CHANNEL_NAMES[c] };
        // Per-channel mu amplitude is suppressed near C3 contralateral to right hand.
        const c3Dist = Math.hypot(e.x + 0.47, e.y);
        const c4Dist = Math.hypot(e.x - 0.47, e.y);
        const muSuppression = Math.exp(-c3Dist * 3.0) * erdBias;     // [0..0.7]
        const muEnhancement = Math.exp(-c4Dist * 3.0) * erdBias * 0.3;
        const muAmp = 14 * (1 - muSuppression + muEnhancement);
        const betaAmp = 5 * (1 - muSuppression * 0.6);
        const slowAmp = 22 + (c % 5);

        const rawRow = new Array(CHUNK_SAMPLES);
        const preRow = new Array(CHUNK_SAMPLES);
        for (let i = 0; i < CHUNK_SAMPLES; i++) {
          const sIdx = this.sampleCounter + i;
          const t = sIdx / SAMPLE_RATE;
          const slow  = Math.sin(2 * Math.PI * 1.3 * t + c * 0.31) * slowAmp;
          const mu    = Math.sin(2 * Math.PI * 10  * t + c * 0.73) * muAmp
                      + Math.sin(2 * Math.PI * 11.7 * t + c * 1.27) * muAmp * 0.4;
          const beta  = Math.sin(2 * Math.PI * 20  * t + c * 1.11) * betaAmp;
          const drift = Math.sin(2 * Math.PI * 0.25 * t + c * 0.17) * 6;
          const pinkBase = slow * 0.35 + mu * 0.55 + beta * 0.4 + drift;
          // Raw: add line noise (50 Hz EU mains) + broadband noise.
          const line   = Math.sin(2 * Math.PI * 50 * t) * 7;
          const noise  = (this.rng() - 0.5) * 22;
          rawRow[i] = pinkBase + line + noise;
          // Preprocessed: clean + slightly stronger mu (after filtering).
          const cleanNoise = (this.rng() - 0.5) * 3;
          preRow[i] = pinkBase * 0.9 + mu * 0.25 + cleanNoise;
        }
        raw[c] = rawRow;
        pre[c] = preRow;
      }
      this.sampleCounter += CHUNK_SAMPLES;
      this._dispatch({ type: 'raw',          timestamp: ts, data: raw });
      this._dispatch({ type: 'preprocessed', timestamp: ts, data: pre });
    }

    _emitBandPower() {
      const n = CHANNEL_NAMES.length;
      const mu = new Array(n);
      const beta = new Array(n);
      const electrodes = window.ELECTRODES_32 || [];
      const bias = 0.9;
      for (let c = 0; c < n; c++) {
        const e = electrodes[c] || { x: 0, y: 0 };
        const c3Dist = Math.hypot(e.x + 0.47, e.y);
        const c4Dist = Math.hypot(e.x - 0.47, e.y);
        // ERD (negative dB) on contralateral side, mild ERS (positive) on ipsilateral.
        const erdMu = -Math.exp(-c3Dist * 3.0) * 5.5 * bias;
        const ersMu =  Math.exp(-c4Dist * 3.0) * 1.6 * bias;
        const erdB  = -Math.exp(-c3Dist * 3.4) * 3.6 * bias;
        const ersB  =  Math.exp(-c4Dist * 3.4) * 1.2 * bias;
        mu[c]   = erdMu + ersMu + (this.rng() - 0.5) * 1.4;
        beta[c] = erdB  + ersB  + (this.rng() - 0.5) * 1.0;
      }
      this._dispatch({
        type: 'band_power',
        timestamp: Date.now() / 1000,
        mu, beta,
      });
    }

    _emitClassification() {
      const base = {};
      let total = 0;
      CLASSES.forEach(k => {
        const v = 0.06 + this.rng() * 0.05;
        base[k] = v; total += v;
      });
      // Boost the active class.
      const boost = 0.55 + this.rng() * 0.12;
      base[this.currentClass] += boost;
      total += boost;
      const probabilities = {};
      CLASSES.forEach(k => { probabilities[k] = base[k] / total; });
      this._dispatch({
        type: 'classification',
        timestamp: Date.now() / 1000,
        predicted: this.currentClass,
        probabilities,
      });
    }

    retry() { /* no-op for mock */ this.disconnect(); this.connect(); }

    disconnect() {
      this.intervals.forEach(clearInterval);
      this.intervals = [];
      this._setStatus('disconnected');
    }
  }

  window.MockBackend = MockBackend;
  window.MOCK_BACKEND_CLASSES = CLASSES;
})();
