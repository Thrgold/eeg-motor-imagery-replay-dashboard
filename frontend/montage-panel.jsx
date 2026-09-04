// montage-panel.jsx — multi-channel waveform "montage" view used on the
// dedicated waveform detail pages. Renders N stacked thin lanes (up to 32),
// supports click-to-focus (a single lane is enlarged to twice the height),
// and accepts a tight Y-range from the parent.
//
// Differences from WaveformPanel (which targets up to 6 channels with full
// per-lane chrome):
//   • No per-lane Y tick labels — only a global ±range label at top/bottom.
//   • Click a lane to mark it "focused" — focused lane gets 2× height + bold
//     label + the global readout displays its instantaneous μV. Click again to
//     unfocus.
//   • Optionally an `extractor(buf, ch)` function lets a parent compute the
//     samples to display (used for "diff" mode = preprocessed - raw).

const DEFAULT_MONTAGE_PALETTE = [
  '#1e5fb8', '#c2410c', '#15803d', '#7c3aed', '#be123c', '#0891b2',
  '#0369a1', '#9333ea', '#a16207', '#0f766e', '#9f1239', '#1d4ed8',
  '#65a30d', '#7e22ce', '#b91c1c', '#0e7490', '#4338ca', '#92400e',
  '#166534', '#86198f', '#9a3412', '#155e75', '#3730a3', '#854d0e',
  '#14532d', '#701a75', '#7c2d12', '#0c4a6e', '#1e1b4b', '#365314',
  '#581c87', '#831843',
];

function MontagePanel({
  theme,
  title, hint, rightSlot, panelStyle,
  buffer,                  // MultiChannelBuffer ref (primary)
  diffWithBuffer,          // optional ref — when set, plotted = primary - this
  channelNames,            // string[] from hello_ack
  sampleRate = 250,
  timeWindow = 5,
  yRangeMicrov = 80,
  playing = true,
  focusedChannel = null,   // string | null
  onFocusChannel = () => {},
}) {
  const padL = 56;
  const padR = 16;
  const padT = 14;
  const padB = 26;

  const containerRef = React.useRef(null);
  // ResizeObserver → keep an actual pixel size so the SVG resolution matches.
  const [size, setSize] = React.useState({ w: 1200, h: 600 });
  React.useEffect(() => {
    if (!containerRef.current) return undefined;
    const el = containerRef.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(400, cr.width), h: Math.max(220, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const innerW = Math.max(50, W - padL - padR);
  const innerH = Math.max(50, H - padT - padB);

  const channels = React.useMemo(() => {
    const list = (channelNames && channelNames.length) ? channelNames : (window.DEFAULT_CHANNEL_NAMES || []);
    return list.map((nm, i) => ({
      name: nm,
      bufIdx: i,
      color: DEFAULT_MONTAGE_PALETTE[i % DEFAULT_MONTAGE_PALETTE.length],
    }));
  }, [channelNames]);

  const nCh = channels.length;
  // Lane allocation: focused lane gets 2× a regular lane height.
  const focusIdx = focusedChannel ? channels.findIndex(c => c.name === focusedChannel) : -1;
  const hasFocus = focusIdx >= 0;
  const totalUnits = nCh + (hasFocus ? 1 : 0); // focused lane = 2 units
  const unit = innerH / Math.max(1, totalUnits);
  // Precompute each lane's [top, height].
  const lanes = React.useMemo(() => {
    const out = [];
    let y = padT;
    for (let i = 0; i < nCh; i++) {
      const h = (i === focusIdx ? 2 : 1) * unit;
      out.push({ top: y, height: h, channel: channels[i], idx: i });
      y += h;
    }
    return out;
  }, [nCh, focusIdx, unit, channels]);

  // SVG path refs per channel.
  const pathRefs = React.useRef([]);
  const readoutRefs = React.useRef([]);

  const nSamples = Math.max(64, Math.floor(timeWindow * sampleRate));
  const stride = Math.max(1, Math.floor(nSamples / Math.min(nSamples, Math.max(400, innerW))));
  const yScale = (Math.max(8, unit) * 0.42) / yRangeMicrov;

  // Build a single lane path from samples.
  function buildPath(samples, laneTop, laneH, scale) {
    const cy = laneTop + laneH / 2;
    let d = '';
    let prevX = -1;
    for (let i = 0; i < samples.length; i += stride) {
      const x = padL + (i / (samples.length - 1)) * innerW;
      if (x === prevX) continue;
      prevX = x;
      const v = samples[i];
      let y = cy - v * scale;
      const top = laneTop + 1;
      const bot = laneTop + laneH - 1;
      if (y < top) y = top;
      if (y > bot) y = bot;
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(2) + ' ';
    }
    return d;
  }  React.useEffect(() => {
    if (!playing) return undefined;
    if (!buffer || !buffer.current) return undefined;

    let raf = 0;
    const primary = new Float32Array(nSamples);
    const secondary = new Float32Array(nSamples);
    let lastRead = 0;

    function tick(tsNow) {
      const buf = buffer.current;
      const dbuf = diffWithBuffer && diffWithBuffer.current;
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i];
        // Per-lane scale: focused lane uses larger amplitude. Use 0.85× lane
        // half-height so signals are clearly visible even with 32 channels;
        // soft-clip keeps overshoot inside the lane.
        const lh = lane.height;
        const localScale = (lh * 0.85) / yRangeMicrov;
        buf.latest(lane.channel.bufIdx, nSamples, primary);
        let samples = primary;
        if (dbuf) {
          dbuf.latest(lane.channel.bufIdx, nSamples, secondary);
          for (let k = 0; k < nSamples; k++) primary[k] = primary[k] - secondary[k];
          samples = primary;
        }
        const node = pathRefs.current[i];
        if (node) node.setAttribute('d', buildPath(samples, lane.top, lane.height, localScale));
      }
      if (tsNow - lastRead > 120) {
        lastRead = tsNow;
        for (let i = 0; i < lanes.length; i++) {
          const lane = lanes[i];
          const node = readoutRefs.current[i];
          if (!node) continue;
          const last = buf.lastValues[lane.channel.bufIdx] || 0;
          const sign = last >= 0 ? '+' : '−';
          node.textContent = sign + Math.abs(last).toFixed(1);
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, buffer, diffWithBuffer, lanes, nSamples, stride, yRangeMicrov, padL, innerW, padT, innerH]);

  const nTicks = Math.max(3, Math.min(timeWindow + 1, 7));
  const tickValues = Array.from({ length: nTicks }, (_, i) => -timeWindow + i * timeWindow / (nTicks - 1));

  return (
    <Panel theme={theme} title={title} hint={hint} right={rightSlot} style={panelStyle}>
      <div ref={containerRef} className="absolute inset-0" style={{ fontFamily: '"Microsoft YaHei"' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
          {/* Lane backgrounds (zebra) */}
          {lanes.map((lane, i) => (
            i % 2 === 1 ? (
              <rect key={`bg-${i}`} x={padL} y={lane.top} width={innerW} height={lane.height}
                    fill="rgba(15,23,42,0.018)" />
            ) : null
          ))}

          {/* Vertical gridlines */}
          {tickValues.map((t, i) => {
            const x = padL + (i / (tickValues.length - 1)) * innerW;
            return (
              <line key={`vg-${i}`} x1={x} x2={x} y1={padT} y2={padT + innerH}
                    stroke={theme.gridStroke} strokeWidth="1" />
            );
          })}

          {/* Lane mid lines */}
          {lanes.map((lane, i) => (
            <line key={`md-${i}`} x1={padL} x2={W - padR}
                  y1={lane.top + lane.height / 2} y2={lane.top + lane.height / 2}
                  stroke={theme.gridStroke} strokeWidth="1" strokeDasharray="3 3" />
          ))}

          {/* Y axis */}
          <line x1={padL} x2={padL} y1={padT} y2={padT + innerH}
                stroke={theme.axisLine} strokeWidth="1.4" />
          {/* X axis */}
          <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH}
                stroke={theme.axisLine} strokeWidth="1.4" />

          {/* X ticks */}
          {tickValues.map((t, i) => {
            const x = padL + (i / (tickValues.length - 1)) * innerW;
            return (
              <g key={`xt-${i}`}>
                <line x1={x} x2={x} y1={padT + innerH} y2={padT + innerH + 4}
                      stroke={theme.axisLine} strokeWidth="1.2" />
                <text x={x} y={H - 8} textAnchor="middle" fontSize="10.5"
                      fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
                  {t === 0 ? '0' : `${t.toFixed(0)}`}
                </text>
              </g>
            );
          })}

          {/* Global Y range labels (top + bottom of plot area) */}
          <text x={padL - 6} y={padT + 9} textAnchor="end" fontSize="10"
                fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>
            +{yRangeMicrov} μV
          </text>
          <text x={padL - 6} y={padT + innerH - 3} textAnchor="end" fontSize="10"
                fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>
            −{yRangeMicrov} μV
          </text>
          <text x={W - padR + 2} y={H - 8} textAnchor="start" fontSize="10"
                fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>s</text>

          {/* "Now" cursor */}
          <line x1={W - padR} x2={W - padR} y1={padT} y2={padT + innerH}
                stroke={theme.accent} strokeWidth="1.2" strokeOpacity="0.5" />

          {/* Wave paths */}
          {lanes.map((lane, i) => (
            <path
              key={`p-${lane.channel.name}`}
              ref={el => { pathRefs.current[i] = el; }}
              fill="none"
              stroke={lane.channel.color}
              strokeWidth={lane.idx === focusIdx ? 1.6 : 1.15}
              strokeLinejoin="round"
              strokeLinecap="round" />
          ))}

          {/* Per-lane click target (transparent rect) */}
          {lanes.map((lane, i) => (
            <rect
              key={`hit-${i}`}
              x={padL} y={lane.top} width={innerW} height={lane.height}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                onFocusChannel(lane.idx === focusIdx ? null : lane.channel.name);
              }}>
              <title>{lane.channel.name} — 点击{lane.idx === focusIdx ? '取消聚焦' : '聚焦'}</title>
            </rect>
          ))}
        </svg>

        {/* HTML overlay: channel labels + readouts on left margin */}
        <div className="absolute inset-0 pointer-events-none">
          {lanes.map((lane, i) => {
            const cy = lane.top + lane.height / 2;
            const isFocused = lane.idx === focusIdx;
            return (
              <div
                key={`lbl-${lane.channel.name}`}
                className="absolute"
                style={{ left: 4, top: cy, transform: 'translateY(-50%)', width: padL - 10 }}>
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className="font-mono"
                    style={{
                      fontSize: isFocused ? 11 : 9.5,
                      color: theme.textFaint,
                      minWidth: 30, textAlign: 'right',
                    }}>
                    <span ref={el => { readoutRefs.current[i] = el; }}>—</span>
                  </span>
                  <span
                    style={{
                      color: lane.channel.color,
                      fontSize: isFocused ? 13 : 10.5,
                      fontWeight: isFocused ? 700 : 600,
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                    }}>
                    {lane.channel.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hint footer */}
        {hasFocus && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10.5px] font-mono"
               style={{ color: theme.textMuted }}>
            已聚焦 {focusedChannel} · 点击其他通道切换 · 再次点击取消
          </div>
        )}
      </div>
    </Panel>
  );
}

window.MontagePanel = MontagePanel;
window.DEFAULT_MONTAGE_PALETTE = DEFAULT_MONTAGE_PALETTE;
