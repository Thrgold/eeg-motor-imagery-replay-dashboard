// channel-select.jsx — Channel picker popover.
// • shows all available channels in a head-grouped grid
// • allows multi-select up to MAX_DISPLAY_CHANNELS (6)
// • offers spec presets: 关键通道 / 运动皮层 / 中线
//
// Selection state is owned by the parent (App); this component is a pure
// controlled popover.

function ChannelSelectButton({ theme, channelNames, selected, onChange }) {
  const [open, setOpen] = React.useState(false);
  const max = window.MAX_DISPLAY_CHANNELS || 6;

  const toggle = (name) => {
    const has = selected.includes(name);
    if (has) {
      // Don't allow zero-channel display.
      if (selected.length === 1) return;
      onChange(selected.filter(s => s !== name));
    } else {
      if (selected.length >= max) {
        // Replace oldest.
        onChange([...selected.slice(1), name]);
      } else {
        onChange([...selected, name]);
      }
    }
  };

  const applyPreset = (preset) => {
    const avail = preset.channels.filter(c => channelNames.includes(c));
    if (avail.length === 0) return;
    onChange(avail.slice(0, max));
  };

  // Group channels by anatomical band (front → back) for readability.
  const groups = [
    { name: '前额',     prefixes: ['Fp', 'AF']  },
    { name: '额',       prefixes: ['F'],   exclude: ['Fp', 'AF', 'FC'] },
    { name: '额-中央',  prefixes: ['FC']  },
    { name: '中央',     prefixes: ['C', 'T'], exclude: ['CP'] },
    { name: '中央-顶',  prefixes: ['CP']  },
    { name: '顶',       prefixes: ['P'],  exclude: ['PO'] },
    { name: '顶-枕',    prefixes: ['PO']  },
    { name: '枕',       prefixes: ['O']   },
  ];
  function grouped() {
    const used = new Set();
    const out = [];
    groups.forEach(g => {
      const list = channelNames.filter(name => {
        if (used.has(name)) return false;
        if (g.exclude && g.exclude.some(p => name.startsWith(p))) return false;
        return g.prefixes.some(p => name.startsWith(p));
      });
      list.forEach(n => used.add(n));
      if (list.length) out.push({ name: g.name, items: list });
    });
    // Anything missed — drop into "其他".
    const rest = channelNames.filter(n => !used.has(n));
    if (rest.length) out.push({ name: '其他', items: rest });
    return out;
  }
  const sections = grouped();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[12.5px] px-2.5 py-1 rounded-[3px]"
        style={{
          background: open ? theme.accentSoft : 'transparent',
          border: `1px solid ${open ? theme.accent : theme.chipBorder}`,
          color: open ? theme.accent : theme.text
        }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1.5" y="2" width="9" height="8" rx="0.5" />
          <line x1="3.5" y1="4.5" x2="8.5" y2="4.5" />
          <line x1="3.5" y1="6" x2="8.5" y2="6" />
          <line x1="3.5" y1="7.5" x2="6.5" y2="7.5" />
        </svg>
        <span className="whitespace-nowrap">通道选择</span>
        <span className="font-mono tab-nums" style={{ color: open ? theme.accent : theme.textMuted }}>
          {selected.length}/{channelNames.length || 32}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 mt-1 z-50 rounded-[4px]"
            style={{
              background: theme.panelBg,
              border: theme.panelBorder,
              boxShadow: theme.panelShadow !== 'none' ? theme.panelShadow : '0 8px 24px rgba(15,23,42,0.12)',
              backdropFilter: theme.panelBackdrop,
              WebkitBackdropFilter: theme.panelBackdrop,
              padding: 14,
              minWidth: 340,
              maxWidth: 420,
            }}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[12.5px] font-semibold" style={{ color: theme.text }}>选择显示通道</div>
              <div className="text-[10.5px] font-mono" style={{ color: theme.textMuted }}>
                最多 {max} 通道 · 已选 {selected.length}
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(window.CHANNEL_PRESETS || []).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="text-[11.5px] px-2 py-1 rounded-[3px]"
                  style={{
                    background: theme.chip, border: `1px solid ${theme.chipBorder}`,
                    color: theme.text
                  }}>
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange([selected[0] || channelNames[0]])}
                className="text-[11.5px] px-2 py-1 rounded-[3px]"
                style={{
                  background: 'transparent', border: `1px solid ${theme.chipBorder}`,
                  color: theme.textMuted
                }}>
                清空
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {sections.map(sec => (
                <div key={sec.name} className="mb-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] mb-1" style={{ color: theme.textFaint }}>
                    {sec.name}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {sec.items.map(name => {
                      const on = selected.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggle(name)}
                          className="text-[11px] font-mono py-1 rounded-[3px] tab-nums"
                          style={{
                            background: on ? theme.accent : theme.chip,
                            border: `1px solid ${on ? theme.accent : theme.chipBorder}`,
                            color: on ? '#fff' : theme.text,
                            fontWeight: on ? 600 : 500,
                          }}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

window.ChannelSelectButton = ChannelSelectButton;
