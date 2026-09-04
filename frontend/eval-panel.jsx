// eval-panel.jsx — 多模态脑区激活评估面板
// 融合神经激活 / 功能连接 / 解码可信 / 任务表现 四类模态。
//
//  props:
//    theme              — theme object
//    activationEval     — ref { score, modalities: {...} }
//    activationHistory  — ref array<{t, score, neural, connectivity, decoding, task}>
//    playing            — when false, freezes redraw

const { useRef, useEffect } = React;

function EvalPanel({ theme, activationEval, activationHistory, playing }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    function tick() {
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }
    if (playing) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      draw();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const ev = activationEval && activationEval.current ? activationEval.current : null;
  const total = ev ? ev.activation_score : 0;
  const mods = ev && ev.modalities ? ev.modalities : {};

  function scoreLabel(s) {
    if (s >= 80) return '优秀';
    if (s >= 60) return '良好';
    if (s >= 40) return '一般';
    return '较弱';
  }
  function scoreColor(s) {
    if (s >= 80) return '#059669';
    if (s >= 60) return '#2563eb';
    if (s >= 40) return '#d97706';
    return '#dc2626';
  }

  // ---- Canvas history chart ----
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const hist = activationHistory.current || [];
    if (hist.length < 2) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待评估数据...', W / 2, H / 2);
      return;
    }

    const margin = { top: 4, right: 4, bottom: 16, left: 28 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (h * i) / 4;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    }
    ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(String(100 - i * 25), margin.left - 4, margin.top + (h * i) / 4);
    }

    function drawSeries(key, color, lw = 2) {
      const n = hist.length;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
      for (let i = 0; i < n; i++) {
        const x = margin.left + (w * i) / (n - 1);
        const y = margin.top + h * (1 - hist[i][key] / 100);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    drawSeries('score', scoreColor(total), 2.5);
    drawSeries('neural', '#2563eb', 1.5);
    drawSeries('connectivity', '#7c3aed', 1.5);
    drawSeries('decoding', '#059669', 1.5);
    drawSeries('task', '#d97706', 1.5);

    ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('最近 trials', margin.left + w / 2, H - 3);
  }

  // Gauge SVG
  function Gauge({ value, max = 100, color, size = 64, stroke = 7, label }) {
    const r = (size - stroke) / 2;
    const c = size / 2;
    const circ = 2 * Math.PI * r;
    const off = circ * (1 - Math.min(1, value / max));
    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
            transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
          <text x={c} y={c + 3} textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>
            {Math.round(value)}
          </text>
        </svg>
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
    );
  }

  // Detail rows for a modality
  function ModDetails(modKey) {
    const m = mods[modKey];
    if (!m) return null;
    const rows = [];
    if (m.mu_erd_pct !== undefined) rows.push(['Mu-ERD', `${m.mu_erd_pct}%`]);
    if (m.beta_ers_pct !== undefined) rows.push(['Beta-ERS', `${m.beta_ers_pct}%`]);
    if (m.spatial_focus !== undefined) rows.push(['空间聚焦', m.spatial_focus.toFixed(2)]);
    if (m.contra_score !== undefined) rows.push(['对侧优势', m.contra_score.toFixed(2)]);
    if (m.avg_plv !== undefined) rows.push(['平均PLV', m.avg_plv.toFixed(3)]);
    if (m.inter_balance !== undefined) rows.push(['半球平衡', m.inter_balance.toFixed(2)]);
    if (m.confidence !== undefined) rows.push(['置信度', m.confidence.toFixed(2)]);
    if (m.entropy !== undefined) rows.push(['熵', m.entropy.toFixed(2)]);
    if (m.separation !== undefined) rows.push(['区分度', m.separation.toFixed(2)]);
    if (m.online_acc !== undefined && m.online_acc !== null) rows.push(['在线准确率', `${(m.online_acc * 100).toFixed(0)}%`]);
    if (m.rest_purity !== undefined && m.rest_purity !== null) rows.push(['静息纯度', `${(m.rest_purity * 100).toFixed(0)}%`]);
    return (
      <div className="flex flex-col gap-0.5 mt-1">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex justify-between text-[10px] text-gray-500">
            <span>{k}</span>
            <span className="font-mono text-gray-700">{v}</span>
          </div>
        ))}
      </div>
    );
  }

  const modList = [
    { key: 'neural', label: '神经激活', color: '#2563eb' },
    { key: 'connectivity', label: '功能连接', color: '#7c3aed' },
    { key: 'decoding', label: '解码可信', color: '#059669' },
    { key: 'task', label: '任务表现', color: '#d97706' },
  ];

  return (
    <div className="rounded-lg border flex flex-col" style={{ background: theme.cardBg || '#fff', borderColor: theme.cardBorder || '#d0d5dd', color: theme.text || '#1f2937' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: theme.cardBorder || '#d0d5dd' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: scoreColor(total) }} />
          <span className="text-xs font-semibold uppercase tracking-wider">多模态脑区激活评估</span>
        </div>
        <span className="text-xs text-gray-500">
          {ev ? `目标: 左运动区 · ${ev.predicted_class} · 基线${ev.n_baseline}窗` : '等待数据'}
        </span>
      </div>

      {/* Body */}
      <div className="flex items-stretch gap-3 px-3 py-2 flex-1 min-h-0">
        {/* Total gauge */}
        <div className="flex flex-col items-center justify-center gap-1" style={{ minWidth: 90 }}>
          <Gauge value={total} color={scoreColor(total)} size={88} stroke={8} label="综合评分" />
          <span className="text-xs font-semibold" style={{ color: scoreColor(total) }}>{scoreLabel(total)}</span>
        </div>

        {/* Separator */}
        <div className="w-px bg-gray-200 my-1" />

        {/* Four modality mini-gauges */}
        <div className="flex items-center gap-3">
          {modList.map(m => {
            const s = mods[m.key] ? mods[m.key].score : 0;
            return (
              <div key={m.key} className="flex flex-col items-center" style={{ minWidth: 70 }}>
                <Gauge value={s} color={m.color} size={56} stroke={6} label={m.label} />
                {ModDetails(m.key)}
              </div>
            );
          })}
        </div>

        {/* Separator */}
        <div className="w-px bg-gray-200 my-1" />

        {/* History chart */}
        <div className="flex-1 min-w-0 h-full">
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1 text-[10px] text-gray-500 justify-center" style={{ minWidth: 72 }}>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-sm" style={{ background: scoreColor(total) }} />综合</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-sm" style={{ background: '#2563eb' }} />神经</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-sm" style={{ background: '#7c3aed' }} />连接</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-sm" style={{ background: '#059669' }} />解码</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-sm" style={{ background: '#d97706' }} />任务</div>
        </div>
      </div>
    </div>
  );
}

window.EvalPanel = EvalPanel;
