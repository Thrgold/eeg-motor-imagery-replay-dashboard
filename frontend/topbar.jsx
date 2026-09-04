// topbar.jsx — fixed integrated control bar (not a floating card).
// Full width, sits at top of viewport, bottom hairline border.
//
// Now driven by the real backend status from useDataStream:
//   status:  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'
//   meta:    { sampleRate, nChannels, channelNames, classes } | null
//
// Status indicator:
//   connected     green   已连接 + 后端地址/模式
//   connecting    amber   正在连接
//   reconnecting  amber   重连中 (N/5)
//   disconnected  red     已断开
//   failed        red     连接失败

function StatusLED({ status, statusInfo, theme, backendUrl, backendKind }) {
  let kind = 'err';
  let label = '已断开';
  let sub = '离线';
  if (status === 'connected') {
    kind = 'ok';
    label = '已连接';
    sub = backendKind === 'mock' ? '浏览器模拟后端' : (backendUrl || '远程后端');
  } else if (status === 'connecting') {
    kind = 'warn';
    label = '正在连接';
    sub = backendUrl || '握手中…';
  } else if (status === 'reconnecting') {
    kind = 'warn';
    label = '重连中';
    sub = statusInfo && statusInfo.attempt
      ? `重试 ${statusInfo.attempt}/${statusInfo.maxRetries || 5}`
      : '正在重试…';
  } else if (status === 'failed') {
    kind = 'err';
    label = '连接失败';
    sub = '已达上限';
  }
  const ledColor = kind === 'ok' ? theme.led.ok : kind === 'warn' ? theme.led.warn : theme.led.err;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: ledColor,
          boxShadow: kind === 'ok' ? `0 0 0 3px ${ledColor}22` : 'none',
          animation: kind === 'warn' ? 'led-pulse 1.6s ease-in-out infinite' : undefined,
        }} />
      <span className="text-[12.5px] font-medium" style={{ color: theme.text }}>{label}</span>
      <span className="text-[11px] font-mono tab-nums whitespace-nowrap"
            style={{ color: theme.textFaint, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sub}
      </span>
    </div>
  );
}

function Divider({ theme }) {
  return <div className="self-stretch w-px my-1.5" style={{ background: theme.gridStrokeMajor, margin: '6px 0px' }} />;
}

function TimeWindowSelect({ value, onChange, theme }) {
  const [open, setOpen] = React.useState(false);
  const opts = [2, 5, 10];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[12.5px] px-2.5 py-1 rounded-[3px]"
        style={{
          background: open ? theme.accentSoft : 'transparent',
          border: `1px solid ${open ? theme.accent : theme.chipBorder}`,
          color: theme.text
        }}>
        <span style={{ color: theme.textMuted }}>时间窗</span>
        <span className="font-mono tab-nums font-medium" style={{ fontFamily: '"Microsoft YaHei"' }}>{value}s</span>
        <svg width="9" height="9" viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 mt-1 w-32 py-1 z-50 rounded-[3px]"
            style={{ background: theme.panelBg, border: theme.panelBorder, boxShadow: '0 4px 12px rgba(15,23,42,0.08)' }}>
            {opts.map(o =>
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className="block w-full text-left px-3 py-1.5 text-[12.5px] font-mono tab-nums"
                style={{
                  color: o === value ? theme.accent : theme.text,
                  background: o === value ? theme.accentSoft : 'transparent'
                }}
                onMouseEnter={e => { if (o !== value) e.currentTarget.style.background = theme.buttonHover; }}
                onMouseLeave={e => { if (o !== value) e.currentTarget.style.background = 'transparent'; }}>
                {o}s 窗口
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BarButton({ theme, children, onClick, active, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 text-[12.5px] px-2.5 py-1 rounded-[3px]"
      style={{
        background: active ? theme.accentSoft : 'transparent',
        border: `1px solid ${active ? theme.accent : theme.chipBorder}`,
        color: active ? theme.accent : theme.text
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = theme.buttonHover; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {children}
    </button>
  );
}

function PlayPauseButton({ playing, onToggle, theme }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1 rounded-[3px]"
      style={{
        background: playing ? theme.accent : '#ffffff',
        border: `1px solid ${playing ? theme.accent : theme.chipBorder}`,
        color: playing ? '#ffffff' : theme.text
      }}>
      {playing ? (
        <>
          <svg width="9" height="9" viewBox="0 0 10 10"><rect x="2" y="1.5" width="2" height="7" fill="currentColor" /><rect x="6" y="1.5" width="2" height="7" fill="currentColor" /></svg>
          <span>暂停显示</span>
        </>
      ) : (
        <>
          <svg width="9" height="9" viewBox="0 0 10 10"><path d="M2.5 1.5L8 5l-5.5 3.5z" fill="currentColor" /></svg>
          <span>继续显示</span>
        </>
      )}
    </button>
  );
}

function TopBar({
  theme,
  sessionTime,
  status, statusInfo, backendUrl, backendKind,
  meta,
  timeWindow, setTimeWindow,
  playing, setPlaying,
  selectedChannels, setSelectedChannels,

  route, navigate, showWaveformControls = true,
}) {
  const channelNames = (meta && meta.channelNames) || window.DEFAULT_CHANNEL_NAMES || [];
  const sampleRate = (meta && meta.sampleRate) || 250;
  const nChannels = (meta && meta.nChannels) || 32;

  return (
    <div
      className="flex items-center gap-3 px-6 h-[52px] shrink-0"
      style={{
        background: theme.panelBg,
        borderBottom: `1px solid ${theme.gridStrokeMajor}`,
        backdropFilter: theme.panelBackdrop,
        WebkitBackdropFilter: theme.panelBackdrop,
        whiteSpace: 'nowrap',
        position: 'relative',
        zIndex: 2, padding: '0px 24px 0px 40px',
      }}>

      {/* Title */}
      <div className="flex items-baseline gap-3 pr-4 shrink-0 whitespace-nowrap"
           style={{
             borderRight: `1px solid ${theme.gridStrokeMajor}`,
             marginRight: 4, alignSelf: 'stretch',
             display: 'flex', alignItems: 'center',
             padding: '0px 24px 0px 0px',
           }}>
        <div className="whitespace-nowrap"
             style={{
               fontFamily: '"Times New Roman"',
               fontSize: '20px',
               fontWeight: 800,
               color: '#1e5fb8',
               lineHeight: 1.5,
             }}>
          NeuroSync
        </div>
      </div>

      {/* Route tabs */}
      {route && navigate && (
        <TabBar theme={theme} routes={window.ROUTES} current={route} onChange={navigate} />
      )}

      {/* Status */}
      <div className="pl-1 shrink-0">
        <StatusLED status={status} statusInfo={statusInfo} theme={theme}
                   backendUrl={backendUrl} backendKind={backendKind} />
      </div>

      <Divider theme={theme} />

      {/* Sample rate / channel count */}
      <div className="flex items-center gap-2 shrink-0 whitespace-nowrap"
           style={{ fontFamily: '"Microsoft YaHei"' }}>
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.textMuted }}>采样率</span>
        <span className="text-[12.5px] font-mono tab-nums font-medium" style={{ color: theme.text }}>{sampleRate} Hz</span>
        <span className="text-[11px]" style={{ color: theme.textFaint }}>×</span>
        <span className="text-[12.5px] font-mono tab-nums font-medium" style={{ color: theme.text }}>{nChannels} 通道</span>
      </div>

      <Divider theme={theme} />

      {showWaveformControls && (
        <>
          <div className="shrink-0">
            <TimeWindowSelect value={timeWindow} onChange={setTimeWindow} theme={theme} />
          </div>

          <div className="shrink-0">
            <ChannelSelectButton
              theme={theme}
              channelNames={channelNames}
              selected={selectedChannels}
              onChange={setSelectedChannels} />
          </div>


        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.textMuted }}>实验时长</span>
        <span className="text-[12.5px] font-mono tab-nums font-medium" style={{ color: theme.text }}>{sessionTime}</span>
      </div>

      <Divider theme={theme} />

      <div className="shrink-0">
        <PlayPauseButton playing={playing} onToggle={() => setPlaying(!playing)} theme={theme} />
      </div>

      <div className="shrink-0">
        <button
          type="button"
          title="设置 / Tweaks"
          onClick={() => window.__tweaksPanelToggle && window.__tweaksPanelToggle()}
          className="flex items-center justify-center w-8 h-8 rounded-[3px]"
          style={{
            background: 'transparent',
            border: `1px solid ${theme.chipBorder}`,
            color: theme.textMuted,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = theme.buttonHover; e.currentTarget.style.color = theme.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.textMuted; }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.2"/>
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

window.TopBar = TopBar;
