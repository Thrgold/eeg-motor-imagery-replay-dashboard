// topo-detail.jsx — full-page topographic-map detail view.
//
// Layout (left → right):
//   • Large μ topomap + large β topomap, stacked vertically on the LEFT.
//   • RIGHT pane:
//       - "回放" scrubber for the last 30 s of band_power frames.
//         When user drags the scrubber, the displayed maps freeze at that
//         frame. "实时" button (or releasing scrub to rightmost) resumes live.
//       - Channel value table: per channel, current mu & beta values.
//
// We rely on `bandPowerHistory` (a ref to a 30-second sliding array) from
// useDataStream.

function TopoDetailPage({ theme, meta, bandPower, bandPowerHistory, playing }) {
  const channelNames = (meta && meta.channelNames) || window.DEFAULT_CHANNEL_NAMES || [];

  // Force re-render at ~6 Hz so we pull fresh refs.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setTick(x => (x + 1) | 0), 160);
    return () => clearInterval(id);
  }, [playing]);

  // Scrubber: index into bandPowerHistory.current. null → live.
  const [scrubIdx, setScrubIdx] = React.useState(null);
  const hist = (bandPowerHistory && bandPowerHistory.current) || [];
  const isLive = scrubIdx === null;
  const frame = isLive
    ? (bandPower && bandPower.current)
    : (hist[Math.min(scrubIdx, hist.length - 1)] || (bandPower && bandPower.current));

  const muVals = (frame && frame.mu) || [];
  const betaVals = (frame && frame.beta) || [];
  const frameTs = frame && frame.timestamp;
  const now = (bandPower && bandPower.current && bandPower.current.timestamp) || (Date.now() / 1000);
  const dt = frameTs ? Math.max(0, now - frameTs) : 0;

  return (
    <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden">
      {/* Maps */}
      <div
        className="flex-1 min-w-0 flex flex-col gap-3 p-4"
        style={{
          background: theme.panelBg,
          border: theme.panelBorder,
          borderRadius: theme.panelRadius,
          boxShadow: theme.panelShadow,
          backdropFilter: theme.panelBackdrop,
          WebkitBackdropFilter: theme.panelBackdrop,
        }}>
        <div className="flex items-baseline gap-3">
          <div className="text-[14px] font-semibold" style={{ color: theme.text }}>脑地形图详情</div>
          <div className="text-[11px] font-mono" style={{ color: theme.textMuted }}>
            {isLive ? '实时' : `回放 −${dt.toFixed(1)} s`}
          </div>
          <div className="flex-1" />
          <div className="text-[10.5px] font-mono tab-nums" style={{ color: theme.textFaint }}>
            {hist.length} 帧 · 范围 ±6 dB
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-6 items-center justify-items-center">
          <BigTopo theme={theme} band="mu" values={muVals} channelNames={channelNames} />
          <BigTopo theme={theme} band="beta" values={betaVals} channelNames={channelNames} />
        </div>

        {/* Scrubber */}
        <div className="shrink-0 flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setScrubIdx(null)}
              className="text-[11.5px] px-2 py-1 rounded-[3px]"
              style={{
                background: isLive ? theme.accent : theme.chip,
                border: `1px solid ${isLive ? theme.accent : theme.chipBorder}`,
                color: isLive ? '#fff' : theme.text,
                fontFamily: '"Microsoft YaHei"',
              }}>
              {isLive ? '● 实时' : '回到实时'}
            </button>
            <input
              type="range" min={0} max={Math.max(0, hist.length - 1)} step={1}
              value={isLive ? Math.max(0, hist.length - 1) : scrubIdx}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setScrubIdx(v >= hist.length - 1 ? null : v);
              }}
              style={{ flex: 1 }}
              disabled={hist.length < 2} />
            <span className="text-[11px] font-mono tab-nums w-20 text-right" style={{ color: theme.textMuted }}>
              {frameTs ? new Date(frameTs * 1000).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
            </span>
          </div>
          <div className="text-[10.5px]" style={{ color: theme.textFaint, fontFamily: '"Microsoft YaHei"' }}>
            拖动滑块回放过去 30 秒任意时刻的频段功率分布。
          </div>
        </div>
      </div>

      {/* Channel value table */}
      <div
        className="shrink-0 flex flex-col"
        style={{
          width: 320,
          background: theme.panelBg,
          border: theme.panelBorder,
          borderRadius: theme.panelRadius,
          boxShadow: theme.panelShadow,
          backdropFilter: theme.panelBackdrop,
          WebkitBackdropFilter: theme.panelBackdrop,
        }}>
        <div className="px-4 py-2.5 flex items-baseline justify-between"
             style={{ borderBottom: `1px solid ${theme.gridStrokeMajor}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.text }}>通道功率</div>
          <div className="text-[10.5px] font-mono" style={{ color: theme.textMuted }}>dB</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[11.5px] font-mono tab-nums">
            <thead>
              <tr style={{ color: theme.textMuted }}>
                <th className="text-left px-3 py-1.5 font-normal">通道</th>
                <th className="text-right px-3 py-1.5 font-normal">μ</th>
                <th className="text-right px-3 py-1.5 font-normal">β</th>
              </tr>
            </thead>
            <tbody>
              {channelNames.map((nm, i) => {
                const mu = muVals[i];
                const beta = betaVals[i];
                return (
                  <tr key={nm} style={{ borderTop: `1px solid ${theme.gridStroke}` }}>
                    <td className="px-3 py-1" style={{ color: theme.text, fontWeight: 600 }}>{nm}</td>
                    <td className="px-3 py-1 text-right" style={{ color: tintForValue(theme, mu) }}>
                      {fmt(mu)}
                    </td>
                    <td className="px-3 py-1 text-right" style={{ color: tintForValue(theme, beta) }}>
                      {fmt(beta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmt(v) {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  const s = v >= 0 ? '+' : '−';
  return s + Math.abs(v).toFixed(2);
}

function tintForValue(theme, v) {
  if (v === undefined || !isFinite(v)) return theme.textFaint;
  // strong red on the negative side (ERD), strong blue on the positive (ERS)
  // mirror the colorbar — but as a tint, light.
  const intensity = Math.min(1, Math.abs(v) / 6);
  if (v < 0) {
    // diverging hot
    return `rgb(${Math.round(180 + intensity * 60)}, ${Math.round(60 + (1 - intensity) * 30)}, ${Math.round(60 + (1 - intensity) * 30)})`;
  } else {
    // cool
    return `rgb(${Math.round(60 + (1 - intensity) * 30)}, ${Math.round(80 + (1 - intensity) * 30)}, ${Math.round(180 + intensity * 60)})`;
  }
}

// Larger version of the topo map — same renderer, bigger size + name labels
// on every electrode (not just C3/Cz/C4/Fz/Pz).
function BigTopo({ theme, band, values, channelNames }) {
  const SIZE = 360;
  const cx = SIZE / 2, cy = SIZE / 2;
  const r = SIZE * 0.40;
  const filterId = `bigtopo-blur-${band}`;
  const clipId = `bigtopo-clip-${band}`;
  const cmap = React.useMemo(() => makeColormap(theme.topoColors), [theme.topoColors]);
  // Auto-select electrode layout based on channel count.
  const use128 = channelNames && channelNames.length > 32;
  const labelMap = use128 ? (window.ELECTRODE_128_LABEL_TO_INDEX || {}) : (window.ELECTRODE_LABEL_TO_INDEX || {});
  const electrodes = use128 ? (window.ELECTRODES_128 || []) : (window.ELECTRODES_32 || []);

  const positions = React.useMemo(() => {
    if (!channelNames || channelNames.length === 0) return electrodes;
    return channelNames.map((name, i) => {
      const idx = labelMap[name];
      if (idx !== undefined) return electrodes[idx];
      const a = (i / channelNames.length) * Math.PI * 2 - Math.PI / 2;
      return { label: name, x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9 };
    });
  }, [channelNames, electrodes, labelMap]);

  const range = 6;
  const haveData = values && values.length > 0;
  const valToColor = (v) => {
    let t = (v + range) / (2 * range);
    if (!isFinite(t)) t = 0.5;
    if (t < 0) t = 0; if (t > 1) t = 1;
    return cmap(t);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-baseline gap-3">
        <span className="text-[15px] font-semibold" style={{ color: theme.text }}>
          {band === 'mu' ? 'μ 节律' : 'β 节律'}
        </span>
        <span className="text-[11px] font-mono" style={{ color: theme.textMuted }}>
          {band === 'mu' ? '8 – 13 Hz' : '13 – 30 Hz'}
        </span>
      </div>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={valToColor(0)} />
        {haveData && (
          <g clipPath={`url(#${clipId})`}>
            <g filter={`url(#${filterId})`}>
              {positions.map((p, i) => {
                const v = values[i];
                if (v === undefined) return null;
                const px = cx + p.x * r;
                const py = cy + p.y * r;
                return <circle key={i} cx={px} cy={py} r={r * 0.34} fill={valToColor(v)} />;
              })}
            </g>
          </g>
        )}

        {/* Nose / ears / outline */}
        <path d={`M ${cx - 7} ${cy - r + 1} L ${cx} ${cy - r - 12} L ${cx + 7} ${cy - r + 1} Z`}
          fill="none" stroke={theme.textMuted} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={`M ${cx - r + 1} ${cy - 9} Q ${cx - r - 8} ${cy} ${cx - r + 1} ${cy + 9}`}
          fill="none" stroke={theme.textMuted} strokeWidth="1.2" />
        <path d={`M ${cx + r - 1} ${cy - 9} Q ${cx + r + 8} ${cy} ${cx + r - 1} ${cy + 9}`}
          fill="none" stroke={theme.textMuted} strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.textMuted} strokeWidth="1.3" />

        {/* Electrode dots + labels for ALL channels */}
        {positions.map((p, i) => {
          const px = cx + p.x * r;
          const py = cy + p.y * r;
          return (
            <g key={`e-${i}`}>
              <circle cx={px} cy={py} r={2.6}
                fill={theme.appBg} stroke={theme.text} strokeWidth="1.0" />
              <text x={px} y={py - 6} fontSize="8" fontFamily="IBM Plex Mono, monospace"
                textAnchor="middle" fill={theme.text}
                style={{ paintOrder: 'stroke', stroke: theme.appBg, strokeWidth: 2.5 }}>
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ColorBar theme={theme} cmap={cmap} range={range} />
    </div>
  );
}

window.TopoDetailPage = TopoDetailPage;
