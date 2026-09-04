// app.jsx — main BCI dashboard composition. Wires the real data stream from
// useDataStream into the 4 panels + the top bar + error dialog.

const { useState, useEffect, useMemo, useRef } = React;

// Tweakable defaults — persisted via the host's EDITMODE block.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "clinical",
  "timeWindow": 5,
  "playing": true,
  "useMock": true,
  "backendUrl": "ws://localhost:8080/stream",
  "mockClass": "palm"
} /*EDITMODE-END*/;

// Allow overriding useMock via URL:  ?real=1  → disable built-in mock
(function overrideDefaultsFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('real') === '1' || params.get('mock') === '0') {
    TWEAK_DEFAULTS.useMock = false;
  }
})();

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = THEMES[t.theme] || THEMES.clinical;

  // Connect to backend (real WS or in-browser mock).
  const stream = useDataStream({
    url: t.backendUrl,
    useMock: t.useMock,
    autoConnect: true,
  });

  const {
    meta, status, statusInfo, error, clearError, retry,
    rawBuffer, preprocBuffer, bandPower, bandPowerHistory,
    classification, classHistory,
    activationEval, activationHistory,
    client,
  } = stream;

  // Hash router.
  const route = useRoute();

  // When using the in-browser mock, let the Tweaks panel drive the current class.
  useEffect(() => {
    if (!t.useMock) return;
    const c = client && client.current;
    if (c && typeof c.setCurrentClass === 'function') c.setCurrentClass(t.mockClass);
  }, [t.useMock, t.mockClass, meta, client]);

  // Session timer — counts elapsed seconds while playing (UI only).
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!t.playing) return undefined;
    if (status !== 'connected') return undefined;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [t.playing, status]);
  const sessionTime = useMemo(() => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [seconds]);

  // Channel selection (synced between raw + preprocessed waveforms per spec § 5.2).
  // Defaults to C3 / Cz / C4. When hello_ack arrives, filter to channels actually present.
  const [selectedChannels, setSelectedChannels] = useState(['C3', 'Cz', 'C4']);
  useEffect(() => {
    if (!meta || !meta.channelNames || meta.channelNames.length === 0) return;
    const available = new Set(meta.channelNames);
    const kept = selectedChannels.filter(c => available.has(c));
    if (kept.length === 0) {
      // Fall back to first 3 channels.
      setSelectedChannels(meta.channelNames.slice(0, 3));
    } else if (kept.length !== selectedChannels.length) {
      setSelectedChannels(kept);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.channelNames]);

  // Effective "playing" for visualisation: paused if user paused OR not connected.
  const visualPlaying = t.playing && (status === 'connected');

  return (
    <div
      className={`min-h-screen w-full ${theme.appBgClass}`}
      style={{
        background: theme.appBg,
        color: theme.text,
        fontFamily: "'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', ui-sans-serif, system-ui, sans-serif"
      }}
      data-screen-label="01 BCI Dashboard">

      {/* Ambient color wash behind glass panels (only in frosted theme) */}
      {theme.ambient &&
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
          <div className="ambient-blob" style={{ position: 'absolute', left: '5%', top: '8%', width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.45), rgba(139,92,246,0) 65%)', filter: 'blur(40px)' }} />
          <div className="ambient-blob" style={{ position: 'absolute', right: '0%', top: '30%', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.40), rgba(244,114,182,0) 65%)', filter: 'blur(50px)', animationDelay: '-6s' }} />
          <div className="ambient-blob" style={{ position: 'absolute', left: '35%', bottom: '-12%', width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.40), rgba(96,165,250,0) 65%)', filter: 'blur(40px)', animationDelay: '-12s' }} />
        </div>
      }

      <div className="h-screen flex flex-col relative" style={{ zIndex: 1 }}>
        <TopBar
          theme={theme}
          sessionTime={sessionTime}
          status={status}
          statusInfo={statusInfo}
          backendUrl={t.useMock ? '' : t.backendUrl}
          backendKind={t.useMock ? 'mock' : 'ws'}
          meta={meta}
          timeWindow={t.timeWindow}
          setTimeWindow={v => setTweak('timeWindow', v)}
          playing={t.playing}
          setPlaying={v => setTweak('playing', v)}
          selectedChannels={selectedChannels}
          setSelectedChannels={setSelectedChannels}
          overlayMode={false}
          setOverlayMode={() => {}}
          route={route.name}
          navigate={route.navigate}
          showWaveformControls={route.name === 'dashboard'} />

        {route.name === 'dashboard' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 p-3" style={{ fontWeight: 600 }}>
          <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0">
            <WaveformPanel
              theme={theme}
              title="原始脑电"
              hint={selectedChannels.join(' · ')}
              buffer={rawBuffer}
              channelNames={meta && meta.channelNames}
              selectedChannels={selectedChannels}
              sampleRate={meta && meta.sampleRate}
              timeWindow={t.timeWindow}
              playing={visualPlaying}
              yRangeMicrov={80} />

            <WaveformPanel
              theme={theme}
              title="预处理脑电"
              hint={selectedChannels.join(' · ')}
              buffer={preprocBuffer}
              channelNames={meta && meta.channelNames}
              selectedChannels={selectedChannels}
              sampleRate={meta && meta.sampleRate}
              timeWindow={t.timeWindow}
              playing={visualPlaying}
              yRangeMicrov={40} />

            <TopoPanel
              theme={theme}
              title="脑地形图"
              hint="μ + β 频段功率 · 5 Hz 更新"
              bandPower={bandPower}
              channelNames={meta && meta.channelNames}
              playing={visualPlaying}
              range={6} />

            <ClassificationPanel
              theme={theme}
              classes={meta && meta.classes}
              classification={classification}
              classHistory={classHistory}
              playing={visualPlaying} />
          </div>

          <div style={{ height: 120, minHeight: 120 }}>
            <EvalPanel
              theme={theme}
              activationEval={activationEval}
              activationHistory={activationHistory}
              playing={visualPlaying} />
          </div>
        </div>
        )}

        {(route.name === 'raw' || route.name === 'preprocessed') && (
          <WaveformDetailPage
            theme={theme}
            meta={meta}
            rawBuffer={rawBuffer}
            preprocBuffer={preprocBuffer}
            selectedChannels={selectedChannels}
            setSelectedChannels={setSelectedChannels}
            timeWindow={t.timeWindow}
            playing={visualPlaying}
            variant={route.name} />
        )}

        {route.name === 'topo' && (
          <TopoDetailPage
            theme={theme}
            meta={meta}
            bandPower={bandPower}
            bandPowerHistory={bandPowerHistory}
            playing={visualPlaying} />
        )}

        {route.name === 'classification' && (
          <ClassificationDetailPage
            theme={theme}
            meta={meta}
            classification={classification}
            classHistory={classHistory}
            playing={visualPlaying} />
        )}
      </div>

      {/* Error dialog (only renders when an error message arrives) */}
      <ErrorDialog
        theme={theme}
        error={error}
        onDismiss={clearError}
        onRetry={retry} />

      {/* Tweaks panel */}
      <TweaksPanel>
        <TweakSection label="数据源" />
        <TweakToggle
          label="使用内置模拟"
          value={t.useMock}
          onChange={v => setTweak('useMock', v)} />
        <TweakText
          label="后端 WS 地址"
          value={t.backendUrl}
          onChange={v => setTweak('backendUrl', v)} />

        <TweakSection label="演示控制" />
        <TweakRadio
          label="时间窗"
          value={t.timeWindow}
          options={[2, 5, 10]}
          onChange={v => setTweak('timeWindow', v)} />
        <TweakToggle
          label="实时显示"
          value={t.playing}
          onChange={v => setTweak('playing', v)} />
        <TweakSelect
          label="模拟当前类别"
          value={t.mockClass}
          options={[
            { value: 'palm',   label: '开掌' },
            { value: 'fist',   label: '抓笔' },
            { value: 'ok',     label: 'OK 手势' },
            { value: 'invert', label: '搓指' },
          ]}
          onChange={v => setTweak('mockClass', v)} />

        <TweakSection label="主题" />
        <TweakRadio
          label="风格"
          value={t.theme}
          options={['clinical', 'frosted', 'neural']}
          onChange={v => setTweak('theme', v)} />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
