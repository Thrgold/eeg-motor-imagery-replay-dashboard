// waveform-detail.jsx — full-screen detail page for raw OR preprocessed
// waveforms. Layout:
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │ Side controls  │  MontagePanel (32-channel, click-to-focus)   │
//   │  • Y range     │                                                │
//   │  • time win    │                                                │
//   │  • diff mode   │                                                │
//   └────────────────────────────────────────────────────────────────┘
//
// Time window is taken from the global topbar setting; the local "扩展" slider
// allows 1 – 30 s and overrides only on this page.

function WaveformDetailPage({
  theme, meta,
  rawBuffer, preprocBuffer,
  selectedChannels, setSelectedChannels,
  timeWindow,
  playing,
  variant, // 'raw' | 'preprocessed'
}) {
  const isPre = variant === 'preprocessed';
  const primary = isPre ? preprocBuffer : rawBuffer;
  const channelNames = (meta && meta.channelNames) || window.DEFAULT_CHANNEL_NAMES || [];
  const sampleRate = (meta && meta.sampleRate) || 250;

  // Local controls (overrides while on this page).
  const [yRange, setYRange] = React.useState(isPre ? 40 : 80);
  const [yAuto, setYAuto] = React.useState(false);
  const [localWindow, setLocalWindow] = React.useState(timeWindow);
  React.useEffect(() => { setLocalWindow(timeWindow); }, [timeWindow]);
  const [diffMode, setDiffMode] = React.useState(false);
  const [focusedChannel, setFocusedChannel] = React.useState(null);

  // Auto Y: sample max |v| across all displayed channels every 500 ms.
  React.useEffect(() => {
    if (!yAuto || !primary || !primary.current) return undefined;
    const id = setInterval(() => {
      const buf = primary.current;
      if (!buf) return;
      let maxAbs = 0;
      const n = channelNames.length;
      for (let c = 0; c < n; c++) {
        const v = Math.abs(buf.lastValues[c] || 0);
        if (v > maxAbs) maxAbs = v;
      }
      // 1.6× headroom, clamp to [10..400].
      const target = Math.max(10, Math.min(400, Math.ceil(maxAbs * 1.6 / 10) * 10));
      if (Math.abs(target - yRange) > 5) setYRange(target);
    }, 500);
    return () => clearInterval(id);
  }, [yAuto, primary, channelNames, yRange]);

  // Y-range presets (μV).
  const Y_PRESETS = [25, 50, 100, 200];

  return (
    <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden">
      {/* Side controls */}
      <div
        className="shrink-0 flex flex-col gap-3 p-3"
        style={{
          width: 260,
          background: theme.panelBg,
          border: theme.panelBorder,
          borderRadius: theme.panelRadius,
          boxShadow: theme.panelShadow,
          backdropFilter: theme.panelBackdrop,
          WebkitBackdropFilter: theme.panelBackdrop,
        }}>
        <div className="text-[12px] uppercase tracking-[0.16em]"
             style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"' }}>
          视图设置
        </div>

        <ControlGroup label="Y 轴范围" theme={theme}>
          <div className="flex items-center gap-1.5 mb-2">
            {Y_PRESETS.map(v => (
              <button key={v} type="button"
                onClick={() => { setYAuto(false); setYRange(v); }}
                className="text-[11.5px] px-2 py-1 rounded-[3px] font-mono tab-nums flex-1"
                style={{
                  background: !yAuto && v === yRange ? theme.accent : theme.chip,
                  border: `1px solid ${!yAuto && v === yRange ? theme.accent : theme.chipBorder}`,
                  color: !yAuto && v === yRange ? '#fff' : theme.text,
                }}>
                ±{v}
              </button>
            ))}
            <button type="button"
              onClick={() => setYAuto(!yAuto)}
              className="text-[11.5px] px-2 py-1 rounded-[3px] flex-1"
              style={{
                background: yAuto ? theme.accent : theme.chip,
                border: `1px solid ${yAuto ? theme.accent : theme.chipBorder}`,
                color: yAuto ? '#fff' : theme.text,
                fontFamily: '"Microsoft YaHei"',
              }}>
              自动
            </button>
          </div>
          <div className="text-[10.5px] font-mono" style={{ color: theme.textFaint }}>
            当前 ±{yRange} μV {yAuto ? '· 自动适应' : ''}
          </div>
        </ControlGroup>

        <ControlGroup label="时间窗 (本页)" theme={theme}>
          <input
            type="range" min={1} max={30} step={1}
            value={localWindow}
            onChange={e => setLocalWindow(parseInt(e.target.value, 10))}
            style={{ width: '100%' }} />
          <div className="text-[10.5px] font-mono tab-nums mt-1" style={{ color: theme.textFaint }}>
            {localWindow} 秒（1 – 30）
          </div>
        </ControlGroup>

        {isPre && (
          <ControlGroup label="差值模式" theme={theme}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={diffMode} onChange={e => setDiffMode(e.target.checked)} />
              <span className="text-[12px]" style={{ color: theme.text }}>
                显示 预处理 − 原始
              </span>
            </label>
            <div className="text-[10.5px] mt-1" style={{ color: theme.textFaint, fontFamily: '"Microsoft YaHei"' }}>
              开启后波形为差值（即被去除的噪声成分）
            </div>
          </ControlGroup>
        )}

        <ControlGroup label="聚焦通道" theme={theme}>
          <div className="text-[11.5px]" style={{ color: theme.text, fontFamily: '"Microsoft YaHei"' }}>
            {focusedChannel ? (
              <span>当前 <span className="font-mono font-semibold">{focusedChannel}</span></span>
            ) : (
              <span style={{ color: theme.textMuted }}>未聚焦</span>
            )}
          </div>
          <div className="text-[10.5px] mt-1" style={{ color: theme.textFaint, fontFamily: '"Microsoft YaHei"' }}>
            在波形面板点击任意通道行可放大它
          </div>
          {focusedChannel && (
            <button type="button"
              onClick={() => setFocusedChannel(null)}
              className="text-[11px] mt-1.5 px-2 py-1 rounded-[3px]"
              style={{ background: theme.chip, border: `1px solid ${theme.chipBorder}`, color: theme.text }}>
              取消聚焦
            </button>
          )}
        </ControlGroup>

        <div className="mt-auto text-[10px]" style={{ color: theme.textFaint, fontFamily: '"Microsoft YaHei"' }}>
          顶栏的「时间窗」「通道选择」对此页 32-通道蒙太奇视图不生效；本视图始终显示全部 {channelNames.length} 通道。
        </div>
      </div>

      {/* Montage */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <MontagePanel
          theme={theme}
          title={isPre ? '预处理脑电 · 32 通道蒙太奇' : '原始脑电 · 32 通道蒙太奇'}
          hint={diffMode ? '差值视图（预处理 − 原始）' : '点击任一通道行可聚焦放大'}
          buffer={primary}
          diffWithBuffer={diffMode ? rawBuffer : null}
          channelNames={channelNames}
          sampleRate={sampleRate}
          timeWindow={localWindow}
          yRangeMicrov={yRange}
          playing={playing}
          focusedChannel={focusedChannel}
          onFocusChannel={setFocusedChannel}
          panelStyle={{ flex: 1, minHeight: 0 }}
          rightSlot={
            <div className="text-[11px] font-mono tab-nums" style={{ color: theme.textMuted }}>
              {channelNames.length} 通道 · {localWindow}s · ±{yRange} μV
            </div>
          } />
      </div>
    </div>
  );
}

function ControlGroup({ label, children, theme }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10.5px] uppercase tracking-[0.16em]"
           style={{ color: theme.textMuted, fontFamily: '"Microsoft YaHei"' }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

window.WaveformDetailPage = WaveformDetailPage;
