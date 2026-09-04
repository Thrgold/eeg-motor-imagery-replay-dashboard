// router.jsx — minimal hash-based router.
//
// Routes:
//   #/           or #/dashboard      → main 4-panel grid
//   #/raw                            → raw-waveform detail page
//   #/preprocessed                   → preprocessed-waveform detail page
//   #/topo                           → topomap detail page
//   #/classification                 → classification detail page
//
// Exports:
//   useRoute()      → { name, hash, navigate(name) }
//   ROUTES          → array of { id, label, hash }

const ROUTES = [
  { id: 'dashboard',      label: '仪表盘',  hash: '#/dashboard',     short: '总览' },
  { id: 'raw',            label: '原始波形', hash: '#/raw',            short: '原始' },
  { id: 'preprocessed',   label: '预处理',  hash: '#/preprocessed',   short: '预处理' },
  { id: 'topo',           label: '脑地形图', hash: '#/topo',           short: '地形图' },
  { id: 'classification', label: '分类结果', hash: '#/classification', short: '分类' },
];

function parseHash(h) {
  const raw = (h || '').replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'dashboard';
  const found = ROUTES.find(r => r.id === raw);
  return found ? found.id : 'dashboard';
}

function useRoute() {
  const [name, setName] = React.useState(() => parseHash(window.location.hash));
  React.useEffect(() => {
    const onHash = () => setName(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    // Normalize URL on first load so the hash always has a canonical form.
    if (!window.location.hash || window.location.hash === '#') {
      try { window.history.replaceState(null, '', '#/dashboard'); } catch (e) {}
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = React.useCallback((id) => {
    const r = ROUTES.find(x => x.id === id) || ROUTES[0];
    if (window.location.hash !== r.hash) window.location.hash = r.hash;
  }, []);
  return { name, hash: window.location.hash, navigate };
}

window.useRoute = useRoute;
window.ROUTES = ROUTES;
