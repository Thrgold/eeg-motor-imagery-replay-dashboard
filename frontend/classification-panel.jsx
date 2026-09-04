// classification-panel.jsx — current prediction + per-class probabilities + 30s history.
//
//   props:
//     theme           — theme object
//     classes         — string[] from meta.classes
//     classification  — ref { predicted, probabilities, timestamp } | null
//     classHistory    — ref array<{t, predicted, probabilities}>
//     playing         — when false, freezes redraw
//     latencyMsRef    — optional ref<number> updated externally with end-to-end latency

const CLASS_LABELS = {
  palm:       { zh: '开掌',       short: '掌',  icon: 'palm' },
  fist:       { zh: '抓笔',       short: '笔',  icon: 'pen' },
  ok:         { zh: 'OK 手势',    short: 'OK',  icon: 'ok' },
  invert:     { zh: '搓指',       short: '搓',  icon: 'rub' },
  // Backend S02 labels (capitalised)
  rest:       { zh: '静息',       short: '息',  icon: 'rest' },
  thumb:      { zh: '拇指',       short: '拇',  icon: 'thumb' },
  index:      { zh: '食指',       short: '食',  icon: 'index' },
  pinky:      { zh: '小指',       short: '小',  icon: 'pinky' },
  // Legacy keys kept for backward-compat with any saved sessions.
  seven:      { zh: '数字 7',     short: '七',  icon: 'seven' },
  right_hand: { zh: '右手',       short: '右',  icon: 'fist' },
  left_hand:  { zh: '左手',       short: '左',  icon: 'palm' },
};

function classMeta(key) {
  const k = (key || '').toLowerCase();
  return CLASS_LABELS[k] || { zh: key, short: (key || '').slice(0, 2), icon: 'rest' };
}

function colorForClass(theme, key, idx) {
  const k = (key || '').toLowerCase();
  if (theme.classColors && theme.classColors[k]) return theme.classColors[k];
  const palette = ['#5a6678', '#be123c', '#d97706', '#15803d', '#1e5fb8', '#6d28d9', '#0891b2', '#be185d'];
  return palette[idx % palette.length];
}

// Stylized hand glyphs for motor-imagery gestures.
function HandIcon({ kind, size = 44, color = 'currentColor' }) {
  const common = {
    width: size, height: size, viewBox: '0 0 32 32',
    fill: 'none', stroke: color, strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (kind) {
    case 'rest':
      return (
        <svg {...common}>
          <path d="M4 16 L28 16" strokeWidth="3" />
          <circle cx="4" cy="16" r="1" fill={color} stroke="none" />
          <circle cx="28" cy="16" r="1" fill={color} stroke="none" />
        </svg>
      );
    case 'fist':
      return (
        <svg {...common}>
          <path d="M9 20 Q9 13 16 13 Q23 13 23 20 L23 24 Q23 27 20 27 L12 27 Q9 27 9 24 Z" />
          <path d="M11 13 L11 10 M15 12 L15 9 M19 12 L19 9 M23 13 L23 11" />
        </svg>
      );
    case 'palm':
      return (
        <svg {...common}>
          <path d="M16 27 L16 5 M11 26 L9 8 M21 26 L23 8 M6 24 L4 12 M26 24 L28 12" />
          <path d="M5 24 Q16 30 27 24" />
        </svg>
      );
    case 'seven':
      return (
        <svg {...common}>
          <path d="M8 8 L24 8 L13 27" strokeWidth="3.2" />
        </svg>
      );
    case 'ok':
      return (
        <svg {...common}>
          <circle cx="11" cy="21" r="5" />
          <path d="M17 17 L26 9 M19 21 L28 15 M20 25 L29 21" />
        </svg>
      );
    case 'invert':
      return (
        <svg {...common}>
          <path d="M7 22 A 11 11 0 1 1 23 9" />
          <path d="M23 5 L26 9 L20 11" />
          <path d="M14 16 Q14 12 18 12" strokeOpacity="0.55" />
        </svg>
      );
    case 'pen':
      // 抓笔 — a pen held in a pinch grip.
      return (
        <svg {...common}>
          <path d="M22 5 L27 10 L14 23 L8 25 L10 19 Z" />
          <path d="M7 26 Q13 23 18 26" strokeOpacity="0.7" />
        </svg>
      );
    case 'rub':
      // 搓指 — thumb + fingertip together with friction lines.
      return (
        <svg {...common}>
          <path d="M12 26 L12 14 Q12 10 15 10 Q18 10 18 14 L18 20" />
          <path d="M18 20 Q12 19 12 13 Q12 9 15 8" strokeOpacity="0.85" />
          <path d="M22 12 L26 12 M22 16 L27 16 M22 20 L26 20" strokeOpacity="0.55" />
        </svg>
      );
    case 'thumb':
      // 拇指 — abstract circle + T.
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2.2" fill="none" />
          <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill={color} stroke="none" style={{ fontFamily: 'ui-monospace, IBM Plex Mono, monospace' }}>T</text>
        </svg>
      );
    case 'index':
      // 食指 — abstract circle + 1.
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2.2" fill="none" />
          <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill={color} stroke="none" style={{ fontFamily: 'ui-monospace, IBM Plex Mono, monospace' }}>1</text>
        </svg>
      );
    case 'pinky':
      // 小指 — abstract circle + P.
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2.2" fill="none" />
          <text x="16" y="21.5" textAnchor="middle" fontSize="14" fontWeight="700" fill={color} stroke="none" style={{ fontFamily: 'ui-monospace, IBM Plex Mono, monospace' }}>P</text>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="3" fill={color} stroke="none" />
        </svg>
      );
  }
}

function ClassBar({ label, prob, color, active, theme }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-20 shrink-0">
        <span className="inline-block w-2 h-2" style={{ background: color }} />
        <span
          className="text-[12.5px] whitespace-nowrap"
          style={{ color: active ? theme.text : theme.textMuted, fontWeight: active ? 600 : 500 }}>
          {label}
        </span>
      </div>
      <div className="flex-1 relative h-5"
           style={{ background: theme.chip, border: `1px solid ${theme.chipBorder}` }}>
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: active ? color : `${color}55`,
            transition: 'width 250ms cubic-bezier(0.22, 1, 0.36, 1)'
          }} />
        <div className="absolute inset-0 flex items-center justify-end pr-2">
          <span
            className="text-[11.5px] font-mono tab-nums"
            style={{
              color: active ? theme.text : theme.textMuted,
              fontWeight: active ? 600 : 500,
              textShadow: active ? `0 0 2px ${theme.panelBg}, 0 0 2px ${theme.panelBg}` : 'none',
              fontFamily: 'ui-monospace',
            }}>
            {pct.toString().padStart(2, '0')}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Stacked-area history strip — renders from `historyArr` (array of class history entries).
function HistoryStrip({ theme, classes, historyArr }) {
  const W = 600;
  const H = 120;
  const padL = 30;
  const padR = 10;
  const padT = 6;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const N = historyArr.length;
  const now = N > 0 ? historyArr[N - 1].t : 0;

  // Render order: rest at bottom (baseline), then everything else.
  const ORDER = (() => {
    const list = classes && classes.length ? [...classes] : ['rest'];
    // Move 'rest' to front if present (case-insensitive).
    const restIdx = list.findIndex(c => (c || '').toLowerCase() === 'rest');
    if (restIdx > 0) { const [restItem] = list.splice(restIdx, 1); list.unshift(restItem); }
    return list;
  })();

  function xFor(t) {
    // t is an absolute timestamp; map to [-30s, 0] window relative to now.
    const dt = t - now;       // ≤ 0
    const u = (dt + 30) / 30; // [0,1]
    return padL + Math.max(0, Math.min(1, u)) * innerW;
  }
  function yFor(v) {
    return padT + (1 - v) * innerH;
  }

  // Precompute cumulative tops per layer.
  const tops = ORDER.map((_, layerIdx) =>
    historyArr.map(d => {
      const p = d.probabilities || {};
      let cum = 0;
      for (let i = 0; i <= layerIdx; i++) cum += p[ORDER[i]] || 0;
      return cum;
    })
  );
  const baselines = ORDER.map((_, layerIdx) =>
    layerIdx === 0 ? historyArr.map(() => 0) : tops[layerIdx - 1]
  );

  function pathFor(values, baseline) {
    if (values.length === 0) return '';
    let d = `M ${xFor(historyArr[0].t)} ${yFor(values[0])}`;
    for (let i = 1; i < values.length; i++) d += ` L ${xFor(historyArr[i].t)} ${yFor(values[i])}`;
    for (let i = values.length - 1; i >= 0; i--) d += ` L ${xFor(historyArr[i].t)} ${yFor(baseline[i])}`;
    return d + ' Z';
  }
  function linePath(values) {
    if (values.length === 0) return '';
    return values.map((v, i) =>
      `${i === 0 ? 'M' : 'L'} ${xFor(historyArr[i].t)} ${yFor(v)}`).join(' ');
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[120px] block">
        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) =>
          <line key={i} x1={padL} x2={W - padR} y1={yFor(v)} y2={yFor(v)}
                stroke={theme.gridStroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}

        {/* Stacked areas */}
        {ORDER.map((key, idx) => (
          <path key={`a-${key}`} d={pathFor(tops[idx], baselines[idx])}
            fill={colorForClass(theme, key, idx)} fillOpacity={0.55} />
        ))}
        {ORDER.map((key, idx) => (
          <path key={`l-${key}`} d={linePath(tops[idx])}
            fill="none" stroke={colorForClass(theme, key, idx)}
            strokeWidth={idx === ORDER.length - 1 ? 1.6 : 1.2}
            strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />
        ))}

        {/* Axes */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />

        {/* Y ticks */}
        {[0, 0.5, 1].map((v, i) =>
          <g key={i}>
            <line x1={padL - 3} x2={padL} y1={yFor(v)} y2={yFor(v)} stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <text x={padL - 5} y={yFor(v) + 3} textAnchor="end" fontSize="9.5"
              fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
              {Math.round(v * 100)}
            </text>
          </g>
        )}

        {/* X ticks: -30, -20, -10, 0 */}
        {[-30, -20, -10, 0].map((s, i) => {
          const xi = padL + ((30 + s) / 30) * innerW;
          return (
            <g key={i}>
              <line x1={xi} x2={xi} y1={padT + innerH} y2={padT + innerH + 3} stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              <text x={xi} y={H - 6} textAnchor="middle" fontSize="9.5"
                fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
                {s === 0 ? '0' : `${s}`}
              </text>
            </g>
          );
        })}

        {/* Axis units */}
        <text x={padL - 5} y={padT - 2} textAnchor="end" fontSize="9.5"
              fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>%</text>
        <text x={W - padR + 2} y={H - 6} textAnchor="start" fontSize="9.5"
              fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>s</text>

        {/* "Now" indicator */}
        <line x1={W - padR} x2={W - padR} y1={padT} y2={padT + innerH}
              stroke={theme.accent} strokeWidth="1" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />

        {/* No-data placeholder */}
        {historyArr.length < 2 && (
          <text x={padL + innerW / 2} y={padT + innerH / 2} textAnchor="middle"
            fontSize="11" fill={theme.textFaint} fontFamily="'Microsoft YaHei'">
            等待分类结果…
          </text>
        )}
      </svg>
    </div>
  );
}

function ClassificationPanel({ theme, classes, classification, classHistory, playing = true, latencyMsRef }) {
  // Classification arrives every 3 s, so polling at 500 ms is plenty to pick up
  // a new prediction promptly (the bars animate via CSS once the value changes).
  const [, setTick] = React.useState(0);
  // Freeze the arrival latency when a new prediction lands, so the readout shows
  // genuine processing latency rather than climbing with staleness between updates.
  const seenTsRef = React.useRef(0);
  const latencyRef = React.useRef(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const live = classification && classification.current;
      const ts = live && live.timestamp ? live.timestamp : 0;
      if (ts && ts !== seenTsRef.current) {
        seenTsRef.current = ts;
        if (latencyMsRef && typeof latencyMsRef.current === 'number') {
          latencyRef.current = latencyMsRef.current;
        } else {
          latencyRef.current = Math.max(0, Math.round((Date.now() / 1000 - ts) * 1000));
        }
        setTick(x => (x + 1) | 0);
      }
    }, 500);
    return () => clearInterval(id);
  }, [playing, classification, latencyMsRef]);

  const live = classification && classification.current;
  const historyArr = (classHistory && classHistory.current) || [];
  const orderedClasses = (classes && classes.length) ? classes : ['palm'];

  const currentKey = live ? live.predicted : orderedClasses[0];
  const meta = classMeta(currentKey);
  const topColor = colorForClass(theme, currentKey, orderedClasses.indexOf(currentKey));
  const topProb = (live && live.probabilities && live.probabilities[currentKey]) || 0;
  const latency = latencyRef.current;

  return (
    <Panel
      theme={theme}
      title="分类结果"
      hint={`${orderedClasses.length} 分类 · 3 s/次`}
      right={
        <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: theme.textMuted }}>
          <span style={{ fontFamily: '"Microsoft YaHei"' }}>延迟</span>
          <span className="tab-nums font-medium" style={{ color: theme.text }}>{latency} ms</span>
        </div>
      }>
      <div className="absolute inset-0 flex flex-col p-4 gap-3 overflow-y-auto">
        {/* Top: big prediction + bars */}
        <div className="flex items-stretch gap-5">
          <div
            className="flex flex-col justify-center px-4 py-2"
            style={{
              background: theme.chip,
              border: `1px solid ${theme.chipBorder}`,
              borderLeft: `3px solid ${topColor}`,
              minWidth: 200
            }}>
            <div className="text-[10.5px] uppercase tracking-[0.16em]" style={{ color: theme.textMuted }}>
              {live ? '当前预测' : '等待数据'}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <HandIcon kind={meta.icon} size={32} color={topColor} />
              <span className="text-[24px] leading-none font-semibold whitespace-nowrap"
                    style={{ color: theme.text, letterSpacing: '0.04em' }}>
                {meta.zh}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-[18px] font-mono tab-nums font-semibold"
                    style={{ color: theme.text, fontFamily: '"Microsoft YaHei"' }}>
                {Math.round(topProb * 100)}
              </span>
              <span className="text-[11px] font-mono" style={{ color: theme.textMuted }}>%</span>
              <span className="text-[11px] ml-1.5"
                    style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"' }}>置信度</span>
            </div>
          </div>

          {/* Bars */}
          <div className="flex-1 flex flex-col justify-center gap-1.5" style={{ fontFamily: 'ui-monospace' }}>
            {orderedClasses.map((k, idx) => {
              const prob = (live && live.probabilities && live.probabilities[k]) || 0;
              return (
                <ClassBar
                  key={k}
                  label={classMeta(k).zh}
                  prob={prob}
                  color={colorForClass(theme, k, idx)}
                  active={k === currentKey && !!live}
                  theme={theme} />
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 -mb-1">
          <span className="text-[10.5px] uppercase tracking-[0.16em] whitespace-nowrap"
                style={{ color: theme.textMuted }}>
            近 30 秒分类历史
          </span>
          <div className="flex-1 h-px" style={{ background: theme.gridStrokeMajor, height: '0px' }} />
        </div>

        {/* History */}
        <div className="flex-1 min-h-0 flex flex-col">
          <HistoryStrip theme={theme} classes={orderedClasses} historyArr={historyArr} />
          <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 px-1 flex-wrap">
            {orderedClasses.map((k, idx) =>
              <div key={k} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5" style={{ background: colorForClass(theme, k, idx) }} />
                <span className="text-[11px] whitespace-nowrap" style={{ color: theme.textMuted }}>
                  {classMeta(k).zh}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

window.ClassificationPanel = ClassificationPanel;
window.HandIcon = HandIcon;
window.classMeta = classMeta;
window.colorForClass = colorForClass;
window.HistoryStrip = HistoryStrip;
