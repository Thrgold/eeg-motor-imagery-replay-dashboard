# Frontend dashboard

Browser dashboard for synthetic mock data or messages from the local replay backend. It visualizes raw/preprocessed windows, heuristic band-power maps, classifications and engineering summaries.

```bash
python -m http.server 5173
```

Open `http://localhost:5173`. The default source is an in-browser synthetic mock. Disable the mock only after starting the configured backend.

React, ReactDOM, Babel, Tailwind CSS and fonts are fetched from public CDNs. JSX is compiled in the browser, so this is a development demonstration rather than a production or offline build. UI frame-rate and displayed latency have not been benchmarked. Topographic interpolation and the `clinical` visual theme are presentation choices, not clinical validation.

The browser client sends a minimal handshake. Configure private data and checkpoint paths locally through backend environment variables; do not expose the server to untrusted networks.
