// classification-detail.jsx — full-page classifier detail view.
//
// Layout:
//   ┌───────────────────────┬────────────────────────────────────────────┐
//   │ Big prediction        │  Probability heatmap (classes × 30s time)  │
//   │  + per-class %        │  Stacked-area history                       │
//   │  + dominance stats    │                                             │
//   │  + transition log     │                                             │
//   └───────────────────────┴────────────────────────────────────────────┘
//
// We re-use HandIcon, classMeta, colorForClass, HistoryStrip from
// classification-panel.jsx (all exported on window).

function ClassificationDetailPage({ theme, meta, classification, classHistory, playing }) {
  // Re-render @ ~6 Hz so we pick up new history entries.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setTick(x => (x + 1) | 0), 160);
    return () => clearInterval(id);
  }, [playing]);

  const live = classification && classification.current;
  const historyArr = (classHistory && classHistory.current) || [];
  const classes = (meta && meta.classes && meta.classes.length) ? meta.classes : ['palm'];

  // Order: rest first, then declared order.
  const ORDER = (() => {
    const list = [...classes];
    const ri = list.indexOf('rest');
    if (ri > 0) { list.splice(ri, 1); list.unshift('rest'); }
    return list;
  })();

  const currentKey = live ? live.predicted : ORDER[0];
  const meta_ = window.classMeta ? window.classMeta(currentKey) : { zh: currentKey, icon: 'rest' };
  const topColor = window.colorForClass ? window.colorForClass(theme, currentKey, ORDER.indexOf(currentKey)) : theme.accent;
  const topProb = (live && live.probabilities && live.probabilities[currentKey]) || 0;

  // Dominance statistics: % time each class was the argmax over the 30 s window.
  const dominance = React.useMemo(() => {
    const counts = {};
    ORDER.forEach(k => { counts[k] = 0; });
    historyArr.forEach(h => {
      let best = ORDER[0], bestV = -Infinity;
      const p = h.probabilities || {};
      ORDER.forEach(k => {
        const v = p[k] || 0;
        if (v > bestV) { bestV = v; best = k; }
      });
      counts[best] = (counts[best] || 0) + 1;
    });
    const total = historyArr.length || 1;
    return ORDER.map(k => ({ key: k, pct: counts[k] / total }));
  }, [historyArr, ORDER.join(',')]);

  // Transition log: detect change points in argmax.
  const transitions = React.useMemo(() => {
    const out = [];
    let prev = null;
    historyArr.forEach((h, i) => {
      let best = ORDER[0], bestV = -Infinity;
      const p = h.probabilities || {};
      ORDER.forEach(k => {
        const v = p[k] || 0;
        if (v > bestV) { bestV = v; best = k; }
      });
      if (best !== prev) {
        out.push({ t: h.t, from: prev, to: best, conf: bestV });
        prev = best;
      }
    });
    // Newest first.
    return out.reverse().slice(0, 60);
  }, [historyArr, ORDER.join(',')]);

  return (
    <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden">
      {/* Left column */}
      <div
        className="shrink-0 flex flex-col gap-3"
        style={{ width: 380 }}>
        {/* Big prediction */}
        <div
          className="px-4 py-4 flex flex-col"
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.panelRadius,
            boxShadow: theme.panelShadow,
            backdropFilter: theme.panelBackdrop,
            WebkitBackdropFilter: theme.panelBackdrop,
            borderLeft: `3px solid ${topColor}`,
          }}>
          <div className="text-[10.5px] uppercase tracking-[0.16em]" style={{ color: theme.textMuted }}>
            {live ? '当前预测' : '等待数据'}
          </div>
          <div className="flex items-center gap-3 mt-2">
            {window.HandIcon && <window.HandIcon kind={meta_.icon} size={56} color={topColor} />}
            <span className="text-[40px] leading-none font-semibold whitespace-nowrap"
                  style={{ color: theme.text, letterSpacing: '0.04em' }}>
              {meta_.zh}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[24px] font-mono tab-nums font-semibold" style={{ color: theme.text }}>
              {Math.round(topProb * 100)}
            </span>
            <span className="text-[12px] font-mono" style={{ color: theme.textMuted }}>%</span>
            <span className="text-[12px] ml-1.5" style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"' }}>置信度</span>
          </div>
        </div>

        {/* Per-class probability bars */}
        <div
          className="p-4 flex flex-col gap-2"
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.panelRadius,
            boxShadow: theme.panelShadow,
            backdropFilter: theme.panelBackdrop,
            WebkitBackdropFilter: theme.panelBackdrop,
          }}>
          <div className="text-[10.5px] uppercase tracking-[0.16em] mb-1"
               style={{ color: theme.textMuted }}>当前概率</div>
          {ORDER.map((k, idx) => {
            const prob = (live && live.probabilities && live.probabilities[k]) || 0;
            const color = window.colorForClass(theme, k, idx);
            const active = k === currentKey;
            return <CompactBar key={k} k={k} prob={prob} color={color} active={active} theme={theme} />;
          })}
        </div>

        {/* Dominance distribution */}
        <div
          className="p-4 flex flex-col gap-1.5"
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.panelRadius,
            boxShadow: theme.panelShadow,
            backdropFilter: theme.panelBackdrop,
            WebkitBackdropFilter: theme.panelBackdrop,
          }}>
          <div className="text-[10.5px] uppercase tracking-[0.16em] mb-0.5"
               style={{ color: theme.textMuted }}>近 30 秒主导类别占比</div>
          {dominance.map((d, idx) => {
            const color = window.colorForClass(theme, d.key, ORDER.indexOf(d.key));
            const pct = Math.round(d.pct * 100);
            return (
              <div key={d.key} className="flex items-center gap-2">
                <div className="w-12 text-[11.5px]" style={{ color: theme.text, fontFamily: '"Microsoft YaHei"' }}>
                  {window.classMeta(d.key).zh}
                </div>
                <div className="flex-1 h-[6px]" style={{ background: theme.chip, border: `1px solid ${theme.chipBorder}` }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                </div>
                <div className="w-9 text-right text-[11px] font-mono tab-nums" style={{ color: theme.textMuted }}>
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Probability heatmap */}
        <div
          className="flex-1 min-h-0 p-4 flex flex-col"
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.panelRadius,
            boxShadow: theme.panelShadow,
            backdropFilter: theme.panelBackdrop,
            WebkitBackdropFilter: theme.panelBackdrop,
          }}>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[13px] font-semibold" style={{ color: theme.text }}>
              概率热力图
            </div>
            <div className="text-[10.5px] font-mono tab-nums" style={{ color: theme.textMuted }}>
              纵 类别 × 横 时间 (近 30 s)
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ProbabilityHeatmap theme={theme} classes={ORDER} historyArr={historyArr} />
          </div>
        </div>

        {/* Stacked-area history (compact reuse) */}
        <div
          className="p-4 flex flex-col"
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.panelRadius,
            boxShadow: theme.panelShadow,
            backdropFilter: theme.panelBackdrop,
            WebkitBackdropFilter: theme.panelBackdrop,
            height: 200,
          }}>
          <div className="text-[10.5px] uppercase tracking-[0.16em] mb-1"
               style={{ color: theme.textMuted }}>堆叠概率（30 s）</div>
          <div className="flex-1 min-h-0">
            {window.HistoryStrip && <window.HistoryStrip theme={theme} classes={ORDER} historyArr={historyArr} />}
          </div>
        </div>
      </div>

      {/* Transition log (rightmost narrow column) */}
      <div
        className="shrink-0 flex flex-col"
        style={{
          width: 280,
          background: theme.panelBg,
          border: theme.panelBorder,
          borderRadius: theme.panelRadius,
          boxShadow: theme.panelShadow,
          backdropFilter: theme.panelBackdrop,
          WebkitBackdropFilter: theme.panelBackdrop,
        }}>
        <div className="px-4 py-2.5 flex items-baseline justify-between"
             style={{ borderBottom: `1px solid ${theme.gridStrokeMajor}` }}>
          <div className="text-[13px] font-semibold" style={{ color: theme.text }}>类别切换日志</div>
          <div className="text-[10.5px] font-mono" style={{ color: theme.textMuted }}>{transitions.length}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {transitions.length === 0 && (
            <div className="px-4 py-6 text-[11.5px] text-center" style={{ color: theme.textFaint, fontFamily: '"Microsoft YaHei"' }}>
              暂无切换记录
            </div>
          )}
          {transitions.map((tr, i) => {
            const toColor = window.colorForClass(theme, tr.to, ORDER.indexOf(tr.to));
            const fromColor = tr.from ? window.colorForClass(theme, tr.from, ORDER.indexOf(tr.from)) : null;
            const date = new Date(tr.t * 1000);
            const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
            return (
              <div key={i} className="px-3 py-2 flex items-center gap-2"
                   style={{ borderTop: i === 0 ? 'none' : `1px solid ${theme.gridStroke}` }}>
                <span className="text-[10px] font-mono tab-nums w-16 shrink-0" style={{ color: theme.textMuted }}>
                  {time}
                </span>
                <span className="flex items-center gap-1 text-[11.5px]" style={{ color: theme.text, fontFamily: '"Microsoft YaHei"' }}>
                  {fromColor && <span className="inline-block w-2 h-2" style={{ background: fromColor }} />}
                  {fromColor ? <span style={{ color: theme.textMuted }}>{window.classMeta(tr.from).zh}</span> : <span style={{ color: theme.textMuted }}>—</span>}
                  <span style={{ color: theme.textFaint }}>→</span>
                  <span className="inline-block w-2 h-2" style={{ background: toColor }} />
                  <span style={{ fontWeight: 600 }}>{window.classMeta(tr.to).zh}</span>
                </span>
                <span className="flex-1" />
                <span className="text-[10px] font-mono tab-nums" style={{ color: theme.textFaint }}>
                  {Math.round(tr.conf * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompactBar({ k, prob, color, active, theme }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 text-[11.5px]" style={{
        color: active ? theme.text : theme.textMuted,
        fontWeight: active ? 600 : 500,
        fontFamily: '"Microsoft YaHei"',
      }}>
        {window.classMeta(k).zh}
      </div>
      <div className="flex-1 relative h-4" style={{ background: theme.chip, border: `1px solid ${theme.chipBorder}` }}>
        <div className="absolute inset-y-0 left-0"
             style={{
               width: `${pct}%`,
               background: active ? color : `${color}55`,
               transition: 'width 250ms cubic-bezier(0.22, 1, 0.36, 1)',
             }} />
        <div className="absolute inset-0 flex items-center justify-end pr-1.5">
          <span className="text-[11px] font-mono tab-nums" style={{
            color: active ? theme.text : theme.textMuted,
            fontWeight: active ? 600 : 500,
          }}>
            {pct.toString().padStart(2, '0')}%
          </span>
        </div>
      </div>
    </div>
  );
}

function ProbabilityHeatmap({ theme, classes, historyArr }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 280 });
  React.useEffect(() => {
    if (!containerRef.current) return undefined;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(300, cr.width), h: Math.max(140, cr.height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const padL = 60, padR = 16, padT = 6, padB = 24;
  const W = size.w, H = size.h;
  const innerW = Math.max(50, W - padL - padR);
  const innerH = Math.max(50, H - padT - padB);

  const N = historyArr.length;
  const now = N > 0 ? historyArr[N - 1].t : 0;
  const rowH = innerH / classes.length;
  // Cell width chosen so we tile the whole 30 s window evenly:
  const cellW = innerW / Math.max(1, N - 1);

  // Color: white at 0, class color at 1.
  function cellColor(color, p) {
    const a = Math.max(0, Math.min(1, p));
    return `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        {/* Row backgrounds */}
        {classes.map((k, i) => (
          <rect key={`bg-${k}`} x={padL} y={padT + i * rowH} width={innerW} height={rowH}
                fill={i % 2 === 1 ? 'rgba(15,23,42,0.025)' : 'transparent'} />
        ))}
        {/* Row separators */}
        {classes.map((_, i) => (
          i > 0 ? <line key={`rs-${i}`} x1={padL} x2={W - padR} y1={padT + i * rowH} y2={padT + i * rowH}
                       stroke={theme.gridStroke} strokeWidth="1" /> : null
        ))}

        {/* Cells */}
        {historyArr.map((d, j) => {
          const xRaw = padL + (j / Math.max(1, N - 1)) * innerW;
          return classes.map((k, i) => {
            const p = (d.probabilities && d.probabilities[k]) || 0;
            if (p < 0.02) return null;
            const color = window.colorForClass(theme, k, i);
            return (
              <rect
                key={`c-${j}-${k}`}
                x={xRaw - cellW * 0.5}
                y={padT + i * rowH + 1}
                width={Math.max(1, cellW)}
                height={rowH - 2}
                fill={cellColor(color, p)} />
            );
          });
        })}

        {/* Axes */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH}
              stroke={theme.axisLine} strokeWidth="1.2" />
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH}
              stroke={theme.axisLine} strokeWidth="1.2" />

        {/* Row labels */}
        {classes.map((k, i) => (
          <text key={`lbl-${k}`} x={padL - 6} y={padT + i * rowH + rowH / 2 + 3.5}
                textAnchor="end" fontSize="11.5"
                fontFamily="'Microsoft YaHei'" fill={theme.text}>
            {window.classMeta(k).zh}
          </text>
        ))}

        {/* X ticks */}
        {[-30, -20, -10, 0].map((s, i) => {
          const x = padL + ((30 + s) / 30) * innerW;
          return (
            <g key={`xt-${i}`}>
              <line x1={x} x2={x} y1={padT + innerH} y2={padT + innerH + 3}
                    stroke={theme.axisLine} strokeWidth="1.2" />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="10"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
                {s === 0 ? '0' : s}
              </text>
            </g>
          );
        })}
        <text x={W - padR + 2} y={H - 8} textAnchor="start" fontSize="10"
              fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>s</text>

        {/* No-data hint */}
        {N < 2 && (
          <text x={padL + innerW / 2} y={padT + innerH / 2} textAnchor="middle"
                fontSize="11.5" fill={theme.textFaint} fontFamily="'Microsoft YaHei'">
            等待分类结果…
          </text>
        )}
      </svg>
    </div>
  );
}

window.ClassificationDetailPage = ClassificationDetailPage;
