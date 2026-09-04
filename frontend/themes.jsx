// themes.jsx — visual style variations for the BCI dashboard.

const THEMES = {
  // ── A. Clinical — real lab-software look (MNE/Brain Vision Analyzer) ──────
  clinical: {
    name: '临床实验室',
    appBg: '#eef0f4',
    appBgClass: '',
    ambient: false,
    text: '#1a2333',
    textMuted: '#4a5468',
    textFaint: '#8a93a4',
    panelBg: '#ffffff',
    panelBorder: '1px solid #c8cfdb',
    panelShadow: 'none',
    panelBackdrop: 'none',
    panelRadius: '4px',
    panelTitle: { color: '#1a2333', weight: 600, size: 13, tracking: '0.01em', upper: false, italic: false, serif: false },
    panelSubtitle: { color: '#8a93a4', weight: 400, italic: false, serif: false },
    accent: '#1e5fb8',
    accentSoft: '#e8f0fb',
    channels: {
      C3: { color: '#1e5fb8', glow: 'transparent' },
      Cz: { color: '#2a3142', glow: 'transparent' },
      C4: { color: '#c2410c', glow: 'transparent' }
    },
    wavePalette: ['#1e5fb8', '#c2410c', '#15803d', '#7c3aed', '#be123c', '#0891b2'],
    gridStroke: '#e3e7ee',
    gridStrokeMajor: '#c8cfdb',
    axisLine: '#6b7589',
    axisText: '#54607a',
    topoColors: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
    classColors: {
      rest:   '#5a6678',  // slate
      fist:   '#be123c',  // rose
      palm:   '#d97706',  // amber
      seven:  '#15803d',  // green
      ok:     '#1e5fb8',  // blue
      invert: '#6d28d9',  // violet
    },
    led: { ok: '#15803d', warn: '#b45309', err: '#b91c1c' },
    chip: '#f4f6fa',
    chipBorder: '#dce1ea',
    button: '#ffffff',
    buttonHover: '#f0f3f8',
    buttonText: '#1a2333',
    scan: false
  },

  // ── B. Frosted glass — visionOS-inspired, editorial italic display ────────
  frosted: {
    name: '磨砂玻璃',
    appBg: '#dde4ef',
    appBgClass: 'frosted-bg',
    ambient: true,
    text: '#1f2937',
    textMuted: '#4f5b73',
    textFaint: '#8995ac',
    panelBg: 'rgba(255, 255, 255, 0.62)',
    panelBorder: '1px solid rgba(255, 255, 255, 0.7)',
    panelShadow:
    '0 1px 0 rgba(255,255,255,0.8) inset, 0 -1px 0 rgba(40,55,85,0.05) inset, 0 30px 60px -30px rgba(60,80,120,0.25), 0 1px 3px rgba(60,80,120,0.06)',
    panelBackdrop: 'blur(30px) saturate(180%)',
    panelRadius: '20px',
    panelTitle: { color: '#1f2937', weight: 400, size: 19, tracking: '-0.01em', upper: false, italic: true, serif: true },
    panelSubtitle: { color: '#7d8aa0', weight: 400, italic: true, serif: true },
    accent: '#6d4cd6',
    accentSoft: 'rgba(109,76,214,0.16)',
    channels: {
      C3: { color: '#4f7cf4', glow: 'transparent' },
      Cz: { color: '#6d4cd6', glow: 'transparent' },
      C4: { color: '#d1457e', glow: 'transparent' }
    },
    wavePalette: ['#4f7cf4', '#d1457e', '#10b981', '#6d4cd6', '#f59e0b', '#0891b2'],
    gridStroke: 'rgba(40,55,85,0.10)',
    gridStrokeMajor: 'rgba(40,55,85,0.20)',
    axisLine: 'rgba(40,55,85,0.45)',
    axisText: '#4f5b73',
    // Diverging palette with crisp saturated ends so it reads through the frost.
    topoColors: ['#1e3a8a', '#3b66d8', '#7aa8ee', '#cfe0f6', '#f5f3f7', '#fbcfdf', '#ec4f8c', '#b8224f', '#741336'],
    classColors: {
      rest:   '#8995ac',
      fist:   '#ec4899',
      palm:   '#f59e0b',
      seven:  '#10b981',
      ok:     '#4f7cf4',
      invert: '#8b5cf6',
    },
    led: { ok: '#10b981', warn: '#f59e0b', err: '#ef4444' },
    chip: 'rgba(255,255,255,0.55)',
    chipBorder: 'rgba(255,255,255,0.65)',
    button: 'rgba(255,255,255,0.5)',
    buttonHover: 'rgba(255,255,255,0.75)',
    buttonText: '#1f2937',
    scan: false
  },

  // ── C. Neural Lab — dark fallback ─────────────────────────────────────────
  neural: {
    name: '深色霓虹',
    appBg: '#0a0e1a',
    appBgClass: 'grid-bg-dark',
    ambient: false,
    text: '#e6edf3',
    textMuted: '#9aa5b6',
    textFaint: '#5b6577',
    panelBg: 'rgba(17, 24, 39, 0.55)',
    panelBorder: '1px solid rgba(148, 163, 184, 0.18)',
    panelShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
    panelBackdrop: 'blur(12px)',
    panelRadius: '4px',
    panelTitle: { color: '#e6edf3', weight: 500, size: 13, tracking: '0.04em', upper: true, italic: false, serif: false },
    panelSubtitle: { color: '#6b7280', weight: 400, italic: false, serif: false },
    accent: '#22d3ee',
    accentSoft: 'rgba(34,211,238,0.12)',
    channels: {
      C3: { color: '#22d3ee', glow: 'rgba(34,211,238,0.3)' },
      Cz: { color: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
      C4: { color: '#f472b6', glow: 'rgba(244,114,182,0.3)' }
    },
    wavePalette: ['#22d3ee', '#f472b6', '#4ade80', '#a78bfa', '#fb923c', '#facc15'],
    gridStroke: 'rgba(148, 163, 184, 0.15)',
    gridStrokeMajor: 'rgba(148, 163, 184, 0.30)',
    axisLine: 'rgba(148, 163, 184, 0.5)',
    axisText: '#8a93a4',
    topoColors: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
    classColors: {
      rest:   '#94a3b8',
      fist:   '#f472b6',
      palm:   '#fb923c',
      seven:  '#4ade80',
      ok:     '#22d3ee',
      invert: '#a78bfa',
    },
    led: { ok: '#22c55e', warn: '#eab308', err: '#ef4444' },
    chip: 'rgba(148,163,184,0.10)',
    chipBorder: 'rgba(148,163,184,0.20)',
    button: 'rgba(148,163,184,0.10)',
    buttonHover: 'rgba(148,163,184,0.18)',
    buttonText: '#e6edf3',
    scan: false
  }
};

// Panel chrome — title row + content area separated by a hairline.
// Title and hint can be rendered in italic serif (editorial) per theme.
function Panel({ theme, title, hint, right, children, style, contentClass = '' }) {
  const t = theme.panelTitle;
  const sub = theme.panelSubtitle;
  const serifStack = "'Instrument Serif', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif";
  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        background: theme.panelBg,
        border: theme.panelBorder,
        borderRadius: theme.panelRadius,
        boxShadow: theme.panelShadow,
        backdropFilter: theme.panelBackdrop,
        WebkitBackdropFilter: theme.panelBackdrop,
        ...style
      }}>
      
      <div className="flex items-baseline justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${theme.gridStrokeMajor}`, height: "38.5px", color: "rgb(139, 193, 220)" }}>
        <div className="flex items-baseline gap-3" style={{ minWidth: 0 }}>
          <div
            style={{
              color: t.color,
              fontWeight: t.weight,
              fontSize: t.size,
              letterSpacing: t.tracking,
              textTransform: t.upper ? 'uppercase' : 'none',
              fontStyle: t.italic ? 'italic' : 'normal',
              fontFamily: t.serif ? serifStack : 'inherit',
              lineHeight: 1.2,
              whiteSpace: 'nowrap'
            }}>
            
            {title}
          </div>
          {hint &&
          <div
            style={{
              color: sub.color,
              fontFamily: sub.serif ? serifStack : "'IBM Plex Mono', ui-monospace, monospace",
              fontStyle: sub.italic ? 'italic' : 'normal',
              fontSize: sub.serif ? 14 : 11,
              lineHeight: 1.2,
              whiteSpace: 'nowrap'
            }}>
            
              {hint}
            </div>
          }
        </div>
        <div style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{right}</div>
      </div>
      <div className={`relative flex-1 min-h-0 ${contentClass}`}>
        {children}
      </div>
    </div>);

}

Object.assign(window, { THEMES, Panel });