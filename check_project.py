"""Structural checks only; no empirical performance claim."""
from pathlib import Path
import ast,re,sys,numpy as np,torch
root=Path(__file__).resolve().parent
for f in root.rglob('*.py'):
 if '__pycache__' not in f.parts: ast.parse(f.read_text(encoding='utf-8-sig'))
sys.path.insert(0,str(root/'backend'))
from models import CNN_LSTM
with torch.no_grad():out=CNN_LSTM(n_classes=4,n_channels=128,n_samples=100).eval()(torch.zeros(2,128,100))
assert out.shape==(2,4) and torch.isfinite(out).all()
html=(root/'frontend/index.html').read_text(encoding='utf-8')
for src in re.findall(r'<script[^>]+src="([^"]+)"',html):
 if not src.startswith(('http://','https://')): assert (root/'frontend'/src).exists(),src
print('PASS: syntax, imports, synthetic model shape, and local frontend references.')
print('No training, accuracy, hardware, latency, or clinical claim was tested.')

