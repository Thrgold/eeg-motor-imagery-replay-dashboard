// tab-bar.jsx — segmented tab control for top-level routes. Sits inline in
// the topbar, between the title and the status indicator.

function TabBar({ theme, current, onChange, routes }) {
  return (
    <div
      className="flex items-center gap-1 rounded-[4px] p-0.5 shrink-0"
      style={{
        background: theme.chip,
        border: `1px solid ${theme.chipBorder}`,
      }}>
      {routes.map(r => {
        const on = r.id === current;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className="text-[12px] px-2.5 py-[5px] rounded-[3px] whitespace-nowrap"
            style={{
              background: on ? theme.panelBg : 'transparent',
              border: `1px solid ${on ? theme.chipBorder : 'transparent'}`,
              color: on ? theme.accent : theme.textMuted,
              fontWeight: on ? 600 : 500,
              boxShadow: on ? '0 1px 2px rgba(15,23,42,0.04)' : 'none',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.color = theme.text; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.color = theme.textMuted; }}>
            {r.short}
          </button>
        );
      })}
    </div>
  );
}

window.TabBar = TabBar;
