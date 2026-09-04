import math

with open('biosemi128.elc', 'r') as f:
    lines = f.readlines()

positions = []
for line in lines[5:5+128]:
    parts = line.strip().split()
    x, y, z = map(float, parts)
    positions.append((x, y, z))

channels = []
for group in ['A', 'B', 'C', 'D']:
    for i in range(1, 33):
        channels.append(group + str(i))

projected = []
for (x, y, z) in positions:
    r = math.sqrt(x*x + y*y + z*z)
    theta = math.acos(max(-1, min(1, z / r)))
    phi = math.atan2(y, x)
    px = theta * math.cos(phi)
    py = theta * math.sin(phi)
    projected.append((px, py))

xs = [p[0] for p in projected]
ys = [p[1] for p in projected]
max_range = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
scale = 0.94 / max_range

print('const ELECTRODES_128 = [')
for i, (ch, (px, py)) in enumerate(zip(channels, projected)):
    nx = px * scale
    ny = -py * scale
    print(f'  {{ label: "{ch}", x: {nx:.4f}, y: {ny:.4f} }},')
print('];')
print()
print('const ELECTRODE_128_LABEL_TO_INDEX = {};')
print('ELECTRODES_128.forEach((e, i) => { ELECTRODE_128_LABEL_TO_INDEX[e.label] = i; });')
