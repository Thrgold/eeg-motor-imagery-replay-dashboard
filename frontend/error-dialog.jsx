// error-dialog.jsx — modal that appears when the backend pushes a `type:error`
// message or the reconnect retry budget is exhausted. Click 确认 to dismiss;
// 重试 triggers a fresh connection attempt via the data-stream hook.

function ErrorDialog({ theme, error, onDismiss, onRetry }) {
  if (!error) return null;
  const codeLabel = (error.code || 'UNKNOWN').toUpperCase();
  const ts = new Date(error.timestamp || Date.now());
  const timeStr =
    ts.getHours().toString().padStart(2, '0') + ':' +
    ts.getMinutes().toString().padStart(2, '0') + ':' +
    ts.getSeconds().toString().padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: 'rgba(10, 14, 26, 0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true">
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.panelBg === 'rgba(255, 255, 255, 0.62)' ? '#ffffff' : theme.panelBg,
          border: theme.panelBorder,
          borderRadius: theme.panelRadius,
          boxShadow: '0 24px 60px -20px rgba(15,23,42,0.35)',
          backdropFilter: theme.panelBackdrop,
          WebkitBackdropFilter: theme.panelBackdrop,
          width: 440,
          maxWidth: 'calc(100vw - 32px)',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${theme.gridStrokeMajor}` }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${theme.led.err}22`,
              color: theme.led.err,
            }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M8 4 L8 9" />
              <circle cx="8" cy="12" r="0.6" fill="currentColor" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold" style={{ color: theme.text }}>
              系统错误
            </div>
            <div className="text-[11px] font-mono tab-nums" style={{ color: theme.textMuted }}>
              {codeLabel} · {timeStr}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed" style={{ color: theme.text }}>
            {error.message}
          </p>
          <p className="text-[11.5px] mt-2.5" style={{ color: theme.textMuted }}>
            前端数据流已暂停。点击「重试连接」可触发新的连接尝试；点击「关闭」继续以离线状态运行。
          </p>
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: `1px solid ${theme.gridStrokeMajor}`, background: theme.chip }}>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[12.5px] px-3 py-1.5 rounded-[3px]"
            style={{
              background: 'transparent',
              border: `1px solid ${theme.chipBorder}`,
              color: theme.text,
            }}>
            关闭
          </button>
          <button
            type="button"
            onClick={() => { onDismiss(); if (onRetry) onRetry(); }}
            className="text-[12.5px] font-medium px-3 py-1.5 rounded-[3px]"
            style={{
              background: theme.accent,
              border: `1px solid ${theme.accent}`,
              color: '#ffffff',
            }}>
            重试连接
          </button>
        </div>
      </div>
    </div>
  );
}

window.ErrorDialog = ErrorDialog;
