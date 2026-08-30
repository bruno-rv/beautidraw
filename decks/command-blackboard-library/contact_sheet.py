#!/usr/bin/env python3
"""Build contact sheets (grids of thumbnails) for visual QA of generated blackboard images."""
import sys
from pathlib import Path
from PIL import Image

def sheet(paths, out, cols=6, cell=(384, 216)):
    rows = (len(paths) + cols - 1) // cols
    W, H = cols * cell[0], rows * cell[1]
    canvas = Image.new('RGB', (W, H), (220, 220, 220))
    for i, p in enumerate(paths):
        img = Image.open(p).convert('RGB').resize(cell)
        x, y = (i % cols) * cell[0], (i // cols) * cell[1]
        canvas.paste(img, (x, y))
    canvas.save(out)
    print(f'{out}: {len(paths)} images, {W}x{H}')

if __name__ == '__main__':
    src = Path(sys.argv[1])
    outdir = Path(sys.argv[2]); outdir.mkdir(parents=True, exist_ok=True)
    paths = sorted(src.glob('*.png'))
    per = 36
    for s in range(0, len(paths), per):
        sheet(paths[s:s+per], outdir / f'sheet-{s//per+1}.png')
    if not paths:
        print('no images in', src)
