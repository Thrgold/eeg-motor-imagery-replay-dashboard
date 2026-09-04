// topo-panel.jsx — μ + β scalp topographic maps driven by `band_power` messages.
//
//   props:
//     theme           — theme object
//     title, hint     — panel chrome
//     bandPower       — ref to { mu:number[], beta:number[], timestamp } | null
//     channelNames    — list from hello_ack
//     playing         — when false, freezes redraw on the last frame
//     range           — half-range for colormap normalization (default ±3 dB)

function TopoMap({ theme, band, values, channelNames, range = 3 }) {
  const SIZE = 220;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * 0.38;
  const filterId = `topo-blur-${band}`;
  const clipId = `topo-clip-${band}`;

  const cmap = React.useMemo(() => makeColormap(theme.topoColors), [theme.topoColors]);
  // Auto-select electrode layout based on channel count.
  const use128 = channelNames && channelNames.length > 32;
  const electrodes = use128 ? (window.ELECTRODES_128 || []) : (window.ELECTRODES_32 || []);
  const labelMap = use128 ? (window.ELECTRODE_128_LABEL_TO_INDEX || {}) : (window.ELECTRODE_LABEL_TO_INDEX || {});
  // Channel-name → electrode position via the hello_ack channelNames if available.
  const positions = React.useMemo(() => {
    if (!channelNames || channelNames.length === 0) return electrodes;
    return channelNames.map((name, i) => {
      const idx = labelMap[name];
      if (idx !== undefined) return electrodes[idx];
      // Fallback: spread unknown electrodes on the outer ring.
      const a = (i / channelNames.length) * Math.PI * 2 - Math.PI / 2;
      return { label: name, x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9 };
    });
  }, [channelNames, electrodes, labelMap]);

  const named = new Set(['C3', 'Cz', 'C4', 'Fz', 'Pz']);

  const valToColor = (v) => {
    // Normalize: [-range, +range] → [0, 1].
    let t = (v + range) / (2 * range);
    if (!isFinite(t)) t = 0.5;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return cmap(t);
  };

  // Effective values: align with positions. If values is empty (no data yet),
  // render a neutral mid-color background and no heat.
  const haveData = values && values.length > 0;
  const n = positions.length;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold" style={{ color: theme.text }}>
          {band === 'mu' ? 'μ 节律' : 'β 节律'}
        </span>
        <span className="text-[10.5px] font-mono"
              style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"', fontSize: 9 }}>
          {band === 'mu' ? '8–13 Hz' : '13–30 Hz'}
        </span>
      </div>

      <div className="relative topo-live">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={r} />
            </clipPath>
          </defs>

          {/* Head fill (neutral so blur doesn't sample transparent) */}
          <circle cx={cx} cy={cy} r={r} fill={valToColor(0)} />

          {/* Heat layer */}
          {haveData && (
            <g clipPath={`url(#${clipId})`}>
              <g filter={`url(#${filterId})`}>
                {positions.map((p, i) => {
                  const v = values[i];
                  if (v === undefined) return null;
                  const px = cx + p.x * r;
                  const py = cy + p.y * r;
                  return (
                    <circle
                      key={i}
                      cx={px}
                      cy={py}
                      r={r * 0.34}
                      fill={valToColor(v)} />
                  );
                })}
              </g>
            </g>
          )}

          {/* Nose */}
          <path d={`M ${cx - 5} ${cy - r + 1} L ${cx} ${cy - r - 8} L ${cx + 5} ${cy - r + 1} Z`}
            fill="none" stroke={theme.textMuted} strokeWidth="1.1" strokeLinejoin="round" />
          {/* Left ear */}
          <path d={`M ${cx - r + 1} ${cy - 6} Q ${cx - r - 6} ${cy} ${cx - r + 1} ${cy + 6}`}
            fill="none" stroke={theme.textMuted} strokeWidth="1.1" />
          {/* Right ear */}
          <path d={`M ${cx + r - 1} ${cy - 6} Q ${cx + r + 6} ${cy} ${cx + r - 1} ${cy + 6}`}
            fill="none" stroke={theme.textMuted} strokeWidth="1.1" />

          {/* Head outline */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.textMuted} strokeWidth="1.2" />

          {/* Electrode dots + named labels */}
          {positions.map((p, i) => {
            const isNamed = named.has(p.label);
            const px = cx + p.x * r;
            const py = cy + p.y * r;
            return (
              <g key={`e-${i}`}>
                <circle
                  cx={px} cy={py}
                  r={isNamed ? 2.2 : 1.4}
                  fill={theme.appBg}
                  stroke={isNamed ? theme.text : theme.textMuted}
                  strokeWidth={isNamed ? 1.0 : 0.7} />
                {isNamed && (
                  <text
                    x={px} y={py - 5}
                    fontSize="7"
                    fontFamily="IBM Plex Mono, monospace"
                    textAnchor="middle"
                    fill={theme.text}
                    style={{ paintOrder: 'stroke', stroke: theme.appBg, strokeWidth: 2 }}>
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {!haveData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-mono" style={{ color: theme.textFaint }}>
              等待 band_power 消息…
            </span>
          </div>
        )}
      </div>

      <ColorBar theme={theme} cmap={cmap} range={range} />
    </div>
  );
}

function ColorBar({ theme, cmap, range }) {
  const N = 32;
  const stops = Array.from({ length: N }, (_, i) => cmap(i / (N - 1)));
  return (
    <div className="flex flex-col items-stretch" style={{ width: 220 }}>
      <div
        className="h-2.5"
        style={{
          background: `linear-gradient(to right, ${stops.join(', ')})`,
          border: `1px solid ${theme.axisLine}`
        }} />
      <div className="relative h-1.5">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) =>
          <span key={i} className="absolute top-0 w-px h-1.5"
            style={{ left: `${p * 100}%`, background: theme.axisLine, transform: 'translateX(-0.5px)' }} />
        )}
      </div>
      <div className="flex justify-between text-[9.5px] font-mono tab-nums"
           style={{ color: theme.axisText, fontFamily: '"Microsoft YaHei"' }}>
        <span>−{range.toFixed(1)}</span>
        <span>−{(range/2).toFixed(1)}</span>
        <span>0</span>
        <span>+{(range/2).toFixed(1)}</span>
        <span>+{range.toFixed(1)}</span>
      </div>
      <div className="text-center text-[10px] mt-0.5 whitespace-nowrap" style={{ color: theme.textMuted }}>
        ERD ← 功率变化 / dB → ERS
      </div>
    </div>
  );
}

function TopoPanel({ theme, title, hint, bandPower, channelNames, playing = true, range = 3 }) {
  // Subscribe to the bandPower ref by polling its timestamp.
  const [, setTick] = React.useState(0);
  const lastTsRef = React.useRef(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const bp = bandPower && bandPower.current;
      const ts = bp ? bp.timestamp : 0;
      if (ts !== lastTsRef.current) {
        lastTsRef.current = ts;
        setTick(x => x + 1);
      }
    }, 100);
    return () => clearInterval(id);
  }, [playing, bandPower]);

  const bp = bandPower && bandPower.current;
  const muValues = bp ? bp.mu : [];
  const betaValues = bp ? bp.beta : [];
  const tsStr = bp && bp.timestamp ? new Date(bp.timestamp * 1000).toLocaleTimeString('zh-CN', { hour12: false }) : '—';

  // Channel count: whatever the backend actually pushed (band_power length,
  // falling back to the channel-name list from hello_ack).
  const nCh = (muValues && muValues.length) || (channelNames && channelNames.length) || 0;
  const chStr = nCh ? `${nCh} 通道` : '— 通道';

  return (
    <Panel
      theme={theme}
      title={title}
      hint={hint}
      right={
        <div className="flex items-center gap-2 text-[11px] font-mono tab-nums" style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"' }}>
          <span>{chStr} · 5 Hz</span>
        </div>
      }>
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="flex items-start justify-center gap-10 w-full max-w-[640px]">
          <TopoMap theme={theme} band="mu" values={muValues} channelNames={channelNames} range={range} />
          <TopoMap theme={theme} band="beta" values={betaValues} channelNames={channelNames} range={range} />
        </div>
      </div>
    </Panel>
  );
}

window.TopoPanel = TopoPanel;
window.ColorBar = ColorBar;
