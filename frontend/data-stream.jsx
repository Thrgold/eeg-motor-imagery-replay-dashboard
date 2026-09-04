// data-stream.jsx — React hook that wires a BackendClient (or MockBackend) into
// ring buffers + reactive UI state.
//
// Returns:
//   {
//     meta:    { sampleRate, nChannels, channelNames, classes } | null
//     status:  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'
//     statusInfo: { attempt?, maxRetries? }
//     error:   { message, code, timestamp } | null      // sticky until clearError()
//     clearError():        dismiss the current error
//     retry():             force a reconnect attempt
//
//     rawBuffer:        MultiChannelBuffer (10 s × sampleRate per channel)
//     preprocBuffer:    MultiChannelBuffer
//     bandPower:        ref { mu: number[], beta: number[], timestamp } | null
//     classification:   ref { predicted, probabilities, timestamp } | null
//     classHistory:     ref of array (last 30 s of classification samples)
//     latestTimestamp:  ref of number (latest data timestamp received)
//
//     client:           the underlying backend (so the tweaks panel can reach
//                       mock.setCurrentClass etc.)
//   }
//
// Buffers and refs are stable across re-renders. Panels read them on every RAF
// tick — they do NOT trigger React re-renders. Only `meta`, `status`, `error`,
// and the small "tick" counter are reactive.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

const BUFFER_SECONDS = 10;
const HISTORY_SECONDS = 30;

function useDataStream({ url, useMock = false, autoConnect = true }) {
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const [statusInfo, setStatusInfo] = useState({});
  const [error, setError] = useState(null);

  // Stable refs.
  const rawBuffer    = useRef(null);
  const preprocBuffer = useRef(null);
  const bandPower    = useRef(null);
  const bandPowerHistory = useRef([]); // [{t, mu:number[], beta:number[]}] for last 30s
  const classification = useRef(null);
  const classHistory = useRef([]);   // [{t, predicted, probabilities}]
  const activationEval = useRef(null); // {score, mu_erd_depth, spatial_focus, ...}
  const activationHistory = useRef([]); // [{t, score, mu_erd_depth, spatial_focus, consistency}]
  const latestTimestamp = useRef(0);
  const clientRef    = useRef(null);

  // Build a fresh client whenever url / useMock changes.
  useEffect(() => {
    let client;
    if (useMock || !window.BackendClient) {
      client = new window.MockBackend();
    } else {
      client = new window.BackendClient({ url });
    }
    clientRef.current = client;

    client.on('_status_change', (s, info) => {
      setStatus(s);
      setStatusInfo(info || {});
    });

    client.on('hello_ack', (msg) => {
      const m = {
        sampleRate: msg.sample_rate || 250,
        nChannels: msg.n_channels || 32,
        channelNames: msg.channel_names && msg.channel_names.length
          ? msg.channel_names
          : (window.DEFAULT_CHANNEL_NAMES || []),
        classes: msg.classes || ['rest', 'right_hand'],
      };
      // (Re)build buffers sized to the backend's actual sample rate.
      const cap = Math.max(1, BUFFER_SECONDS * m.sampleRate) | 0;
      rawBuffer.current     = new window.MultiChannelBuffer(m.nChannels, cap);
      preprocBuffer.current = new window.MultiChannelBuffer(m.nChannels, cap);
      classHistory.current = [];
      bandPower.current = null;
      bandPowerHistory.current = [];
      classification.current = null;
      setMeta(m);
    });

    client.on('raw', (msg) => {
      if (!rawBuffer.current) return;
      const ok = rawBuffer.current.pushChunk(msg.data, msg.timestamp);
      if (ok && typeof msg.timestamp === 'number') latestTimestamp.current = msg.timestamp;
    });

    client.on('preprocessed', (msg) => {
      if (!preprocBuffer.current) return;
      preprocBuffer.current.pushChunk(msg.data, msg.timestamp);
    });

    client.on('band_power', (msg) => {
      const entry = {
        mu: msg.mu || [],
        beta: msg.beta || [],
        timestamp: msg.timestamp || 0,
      };
      bandPower.current = entry;
      const hist = bandPowerHistory.current;
      hist.push({ t: entry.timestamp, mu: entry.mu, beta: entry.beta });
      const cutoff = entry.timestamp - HISTORY_SECONDS;
      while (hist.length > 0 && hist[0].t < cutoff) hist.shift();
    });

    client.on('classification', (msg) => {
      classification.current = {
        predicted: msg.predicted,
        probabilities: msg.probabilities || {},
        timestamp: msg.timestamp || (Date.now() / 1000),
      };
      const t = classification.current.timestamp;
      const hist = classHistory.current;
      hist.push({ t, predicted: msg.predicted, probabilities: classification.current.probabilities });
      // Drop entries older than HISTORY_SECONDS.
      const cutoff = t - HISTORY_SECONDS;
      while (hist.length > 0 && hist[0].t < cutoff) hist.shift();
    });

    client.on('activation_eval', (msg) => {
      const modalities = msg.modalities || {};
      activationEval.current = {
        activation_score: msg.activation_score || 0,
        modalities: modalities,
        target_roi: msg.target_roi || 'motor',
        predicted_class: msg.predicted_class || 'rest',
        n_baseline: msg.n_baseline || 0,
        timestamp: msg.timestamp || (Date.now() / 1000),
      };
      const t = activationEval.current.timestamp;
      const hist = activationHistory.current;
      hist.push({
        t,
        score: msg.activation_score || 0,
        neural: (modalities.neural && modalities.neural.score) || 0,
        connectivity: (modalities.connectivity && modalities.connectivity.score) || 0,
        decoding: (modalities.decoding && modalities.decoding.score) || 0,
        task: (modalities.task && modalities.task.score) || 0,
      });
      const cutoff = t - HISTORY_SECONDS;
      while (hist.length > 0 && hist[0].t < cutoff) hist.shift();
    });

    client.on('status', (msg) => {
      // Backend status messages don't usually need UI bubbles; just log.
      // (Could surface a toast — out of scope for current design.)
      // console.debug('[stream] backend status', msg);
    });

    client.on('error', (msg) => {
      setError({
        message: msg.message || '后端报告了一个未指明的错误',
        code: msg.code || 'UNKNOWN',
        timestamp: Date.now(),
      });
    });

    if (autoConnect) client.connect();

    return () => {
      try { client.disconnect(); } catch (e) {}
      clientRef.current = null;
    };
  }, [url, useMock, autoConnect]);

  const clearError = useCallback(() => setError(null), []);
  const retry = useCallback(() => {
    setError(null);
    if (clientRef.current && clientRef.current.retry) clientRef.current.retry();
  }, []);

  return useMemo(() => ({
    meta, status, statusInfo, error, clearError, retry,
    rawBuffer, preprocBuffer, bandPower, bandPowerHistory,
    classification, classHistory,
    activationEval, activationHistory,
    latestTimestamp, client: clientRef,
  }), [meta, status, statusInfo, error, clearError, retry]);
}

window.useDataStream = useDataStream;
