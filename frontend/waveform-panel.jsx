// waveform-panel.jsx — Multi-channel EEG waveform driven by a MultiChannelBuffer.
//
//   props:
//     theme           — theme object
//     title, hint     — panel chrome
//     buffer          — ref to MultiChannelBuffer (primary stream)
//     overlayBuffer   — optional ref to a second MultiChannelBuffer drawn underneath
//                       (used for the raw/preprocessed overlay-on-pause feature)
//     overlayLabel    — label for overlay legend, e.g. '原始'
//     channelNames    — full list of channel names from hello_ack
//     selectedChannels — array of channel names to display (max 6)
//     sampleRate      — Hz (from meta.sampleRate)
//     timeWindow      — seconds to display (2 / 5 / 10)
//     playing         — boolean; when false, RAF loop pauses (last frame stays)
//     yRangeMicrov    — half-range in μV (default 80 for raw, 40 for preprocessed)
//     pinnedRight     — { label } small overlay top-right (e.g. 离线/暂停)
//
// Renders the buffer at ~30 FPS by directly mutating <path d="…"> attributes.
// React state is NOT used per-frame.

function colorForChannel(theme, name, idx) {
  if (theme.channels && theme.channels[name]) return theme.channels[name].color;
  const palette = theme.wavePalette || ['#1e5fb8', '#c2410c', '#15803d', '#7c3aed', '#be123c', '#0891b2'];
  return palette[idx % palette.length];
}

function WaveformPanel({
  theme, title, hint,
  buffer, overlayBuffer, overlayLabel,
  channelNames, selectedChannels,
  sampleRate = 250,
  timeWindow = 5,
  playing = true,
  yRangeMicrov = 80,
  rightSlot,
}) {
  const VB_W = 1000;
  const VB_H = 360;
  const padL = 60;
  const padR = 22;
  const padT = 14;
  const padB = 30;
  const innerW = VB_W - padL - padR;
  const innerH = VB_H - padT - padB;

  // Resolve selected channel indices into the buffer.
  const channels = React.useMemo(() => {
    const names = (selectedChannels && selectedChannels.length) ? selectedChannels : ['C3', 'Cz', 'C4'];
    return names.map((nm, i) => {
      const idx = channelNames ? channelNames.indexOf(nm) : -1;
      return { name: nm, bufIdx: idx, color: colorForChannel(theme, nm, i) };
    }).filter(c => c.bufIdx >= 0);
  }, [selectedChannels, channelNames, theme]);

  const nLanes = Math.max(1, channels.length);
  const laneH = innerH / nLanes;

  // Refs to the live SVG <path> elements per channel (primary + optional overlay).
  const primaryPathsRef = React.useRef([]);
  const overlayPathsRef = React.useRef([]);
  // Refs to the channel readout text nodes.
  const readoutRefs = React.useRef([]);

  // Number of samples actually displayed = timeWindow × sampleRate.
  const nSamples = Math.max(64, Math.floor(timeWindow * sampleRate));
  // Number of rendered points: cap for performance, downsample if very large.
  const nDrawPoints = Math.min(nSamples, 1200);
  const stride = Math.max(1, Math.floor(nSamples / nDrawPoints));
  const actualPoints = Math.floor(nSamples / stride);

  // Build a single path d string from a Float32Array of samples for a lane.
  function buildPath(samples, laneTop, yScale) {
    const W = innerW;
    const cy = laneTop + laneH / 2;
    let d = '';
    let prevX = -1;
    for (let i = 0; i < samples.length; i += stride) {
      const x = padL + (i / (samples.length - 1)) * W;
      // Skip near-duplicate x (when stride>1 and we're already past actualPoints).
      if (x === prevX) continue;
      prevX = x;
      const v = samples[i];
      let y = cy - v * yScale;
      // Soft clip.
      const top = laneTop + 2;
      const bot = laneTop + laneH - 2;
      if (y < top) y = top;
      if (y > bot) y = bot;
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(2) + ' ';
    }
    return d;
  }

  // RAF loop — runs only when playing && a buffer is available.
  React.useEffect(() => {
    if (!playing) return undefined;
    if (!buffer || !buffer.current) return undefined;
    if (channels.length === 0) return undefined;

    let rafId = 0;
    const sampleScratch = new Float32Array(nSamples);
    const overlayScratch = new Float32Array(nSamples);
    let lastReadout = 0;
    const yScale = (laneH * 0.42) / yRangeMicrov;

    function tick(tsNow) {
      const buf = buffer.current;
      const obuf = overlayBuffer && overlayBuffer.current;
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const laneTop = padT + i * laneH;
        // Primary.
        if (primaryPathsRef.current[i]) {
          buf.latest(ch.bufIdx, nSamples, sampleScratch);
          const d = buildPath(sampleScratch, laneTop, yScale);
          primaryPathsRef.current[i].setAttribute('d', d);
        }
        // Overlay.
        if (obuf && overlayPathsRef.current[i]) {
          obuf.latest(ch.bufIdx, nSamples, overlayScratch);
          const d = buildPath(overlayScratch, laneTop, yScale);
          overlayPathsRef.current[i].setAttribute('d', d);
        }
      }
      // Update text readouts ~10 Hz.
      if (tsNow - lastReadout > 100) {
        lastReadout = tsNow;
        for (let i = 0; i < channels.length; i++) {
          const ch = channels[i];
          const node = readoutRefs.current[i];
          if (!node) continue;
          const last = buf.lastValues[ch.bufIdx] || 0;
          const sign = last >= 0 ? '+' : '−';
          node.textContent = sign + Math.abs(last).toFixed(1);
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, buffer, overlayBuffer, channels, nSamples, stride, laneH, padT, padL, innerW, yRangeMicrov]);

  // When channels list changes, also wipe overlay paths that no longer apply.
  React.useEffect(() => {
    // Reset arrays so the next render captures fresh refs.
    primaryPathsRef.current = primaryPathsRef.current.slice(0, channels.length);
    overlayPathsRef.current = overlayPathsRef.current.slice(0, channels.length);
    readoutRefs.current = readoutRefs.current.slice(0, channels.length);
  }, [channels.length]);

  // X tick values: -timeWindow .. 0
  const nTicks = Math.max(3, Math.min(timeWindow + 1, 6));
  const tickValues = Array.from({ length: nTicks }, (_, i) => -timeWindow + i * timeWindow / (nTicks - 1));
  const yMaxLabel = '+' + Math.round(yRangeMicrov);
  const yMinLabel = '−' + Math.round(yRangeMicrov);
  const yLabels = [yMaxLabel, '0', yMinLabel];

  return (
    <Panel
      theme={theme}
      title={title}
      hint={hint}
      right={rightSlot || (
        <div className="flex items-center gap-2 text-[11px] font-mono tab-nums" style={{ color: theme.textMuted }}>
          <span>{nLanes} 通道 · {timeWindow}s</span>
        </div>
      )}>
      <div className="absolute inset-0" style={{ fontFamily: '"Microsoft YaHei"' }}>
        {/* Chrome layer (axes + gridlines + ticks) */}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {/* Subtle lane backgrounds */}
          {channels.map((_, idx) => {
            if (idx % 2 !== 1) return null;
            const y0 = padT + idx * laneH;
            return <rect key={`bg-${idx}`} x={padL} y={y0} width={innerW} height={laneH} fill="rgba(15,23,42,0.015)" />;
          })}

          {/* Vertical gridlines */}
          {tickValues.map((t, i) => {
            const x = padL + (i / (tickValues.length - 1)) * innerW;
            return (
              <line key={`vg-${i}`} x1={x} x2={x} y1={padT} y2={padT + innerH}
                stroke={theme.gridStroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            );
          })}

          {/* Per-lane mid line */}
          {channels.map((_, idx) => {
            const y0 = padT + idx * laneH;
            const yMid = y0 + laneH / 2;
            return (
              <line key={`mid-${idx}`} x1={padL} x2={VB_W - padR} y1={yMid} y2={yMid}
                stroke={theme.gridStroke} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            );
          })}

          {/* Inter-lane separators */}
          {channels.slice(1).map((_, idx) => {
            const y = padT + (idx + 1) * laneH;
            return <line key={`sep-${idx}`} x1={padL} x2={VB_W - padR} y1={y} y2={y}
              stroke={theme.gridStrokeMajor} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}

          {/* Y axis */}
          <line x1={padL} x2={padL} y1={padT} y2={padT + innerH}
            stroke={theme.axisLine} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          {/* X axis */}
          <line x1={padL} x2={VB_W - padR} y1={padT + innerH} y2={padT + innerH}
            stroke={theme.axisLine} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />

          {/* Y ticks per lane */}
          {channels.map((c, idx) => {
            const y0 = padT + idx * laneH;
            return yLabels.map((lbl, i) => {
              const yFrac = i === 0 ? 0.12 : i === 1 ? 0.5 : 0.88;
              const y = y0 + laneH * yFrac;
              return (
                <g key={`ytk-${idx}-${i}`}>
                  <line x1={padL - 4} x2={padL} y1={y} y2={y}
                    stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10"
                    fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
                    {lbl}
                  </text>
                </g>
              );
            });
          })}

          {/* X ticks */}
          {tickValues.map((t, i) => {
            const x = padL + (i / (tickValues.length - 1)) * innerW;
            return (
              <g key={`xtk-${i}`}>
                <line x1={x} x2={x} y1={padT + innerH} y2={padT + innerH + 4}
                  stroke={theme.axisLine} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                <text x={x} y={VB_H - 10} textAnchor="middle" fontSize="10.5"
                  fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.axisText}>
                  {t === 0 ? '0' : `${t.toFixed(0)}`}
                </text>
              </g>
            );
          })}

          {/* Axis unit labels */}
          <text x={padL - 6} y={padT - 4} textAnchor="end" fontSize="10"
            fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>μV</text>
          <text x={VB_W - padR + 2} y={VB_H - 10} textAnchor="start" fontSize="10"
            fontFamily="IBM Plex Mono, ui-monospace, monospace" fill={theme.textMuted}>s</text>

          {/* "Now" cursor on right edge */}
          <line x1={VB_W - padR} x2={VB_W - padR} y1={padT} y2={padT + innerH}
            stroke={theme.accent} strokeWidth="1.2" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />

          {/* Wave paths layer — direct mutation on RAF tick. */}
          {/* Overlay first so primary draws on top. */}
          {overlayBuffer && channels.map((c, idx) => (
            <path
              key={`wo-${idx}`}
              ref={(el) => { overlayPathsRef.current[idx] = el; }}
              fill="none"
              stroke={c.color}
              strokeOpacity="0.30"
              strokeWidth="1.0"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          ))}
          {channels.map((c, idx) => (
            <path
              key={`wp-${idx}`}
              ref={(el) => { primaryPathsRef.current[idx] = el; }}
              fill="none"
              stroke={c.color}
              strokeWidth="1.3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {/* Channel labels (HTML overlay so font sizing stays crisp) */}
        <div className="absolute inset-0 pointer-events-none">
          {channels.map((c, idx) => {
            const topPct = ((padT + idx * laneH + laneH * 0.5) / VB_H) * 100;
            return (
              <div
                key={c.name}
                className="absolute"
                style={{ left: 8, top: `${topPct}%`, transform: 'translateY(-50%)', width: padL - 16 }}>
                <div className="flex flex-col items-end">
                  <div className="text-[13.5px] font-semibold tracking-wide" style={{ color: c.color }}>
                    {c.name}
                  </div>
                  <div className="text-[9.5px] font-mono tab-nums" style={{ color: theme.textFaint }}>
                    <span ref={(el) => { readoutRefs.current[idx] = el; }}>—</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overlay legend (top-right corner of plotting area) */}
        {overlayBuffer && overlayLabel && (
          <div className="absolute top-1 right-2 flex items-center gap-1.5 text-[10.5px] font-mono"
               style={{ color: theme.textMuted }}>
            <span style={{
              display: 'inline-block', width: 18, height: 2,
              background: theme.textMuted, opacity: 0.4,
            }} />
            <span>{overlayLabel}（叠加）</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

window.WaveformPanel = WaveformPanel;
