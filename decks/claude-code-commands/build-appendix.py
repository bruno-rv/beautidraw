#!/usr/bin/env python3
"""Build appendix-illustrated deck: narrative frames + one labeled scene frame per command.

Embeds optimized 1600x900 JPEG q83 caption derivatives so the file stays openable.
Size gate: refuses to write a deck larger than MAX_MB.
Idempotent: removes any previous appendix elements before appending.
"""
import json, base64, hashlib, io, os, sys, glob, textwrap
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # decks/
ROOT = os.path.dirname(REPO)
BASE = os.path.join(ROOT, 'decks/claude-code-commands/out/deck.excalidraw')
LIB = os.path.join(ROOT, 'decks/command-blackboard-library/images-captioned')
SCENES = os.path.join(ROOT, 'decks/command-blackboard-library/images')
MANIFEST = os.path.join(LIB, 'manifest.json')
OUT = os.path.join(ROOT, 'decks/claude-code-commands/out/deck-illustrated.excalidraw')
MAX_MB = 60

def main():
    deck = json.load(open(BASE))
    details_path = os.path.join(ROOT, 'decks/claude-code-commands/command-details.json')
    d = json.load(open(details_path))
    incomplete = sorted(k for k in d if not (d[k].get('what') or '').strip() or not (d[k].get('example') or '').strip())
    if incomplete:
        print('REFUSED: commands missing what/example:', incomplete)
        sys.exit(1)
    oversize = sorted(k for k in d if len(textwrap.wrap(d[k]['what'], 88)) > 2
                      or len(textwrap.wrap(d[k]['example'], 94)) > 1)
    if oversize:
        print('REFUSED: explanations too long for 2-line what / 1-line example:', oversize)
        sys.exit(1)
    names = sorted(d.keys())
    details = d

    os.makedirs(LIB, exist_ok=True)
    elements = deck['elements']
    files = dict(deck.get('files') or {})
    # strip previous appendix
    elements = [e for e in elements if not str(e.get('id', '')).startswith('apx-')]
    kept_fids = {e.get('fileId') for e in elements if e.get('type') == 'image'}
    files = {k: v for k, v in files.items() if k in kept_fids}

    maxy = max(f['y'] + f['height'] for f in elements if f.get('type') == 'frame')

    def mkframe(eid, x, y, name, w, h):
        return {"id": eid, "type": "frame", "x": x, "y": y, "width": w, "height": h,
                "name": name, "angle": 0, "strokeColor": "#bbbbbb",
                "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2,
                "strokeStyle": "solid", "roughness": 1, "opacity": 100, "groupIds": [],
                "frameId": None, "roundness": None, "seed": 3, "version": 1,
                "versionNonce": 3, "isDeleted": False, "boundElements": None,
                "updated": 1, "link": None, "locked": False}

    def mktext(eid, x, y, text, size, color):
        return {"id": eid, "type": "text", "x": x, "y": y,
                "width": size * len(text) * 0.6, "height": size * 1.25,
                "angle": 0, "strokeColor": color, "backgroundColor": "transparent",
                "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
                "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
                "roundness": None, "seed": 1, "version": 1, "versionNonce": 2,
                "isDeleted": False, "boundElements": None, "updated": 1, "link": None,
                "locked": False, "text": text, "fontSize": size, "fontFamily": 1,
                "textAlign": "left", "verticalAlign": "top", "containerId": None,
                "originalText": text, "lineHeight": 1.25, "baseline": size}

    FW = 1200
    IMG_H = 675          # full-bleed scene
    FH = 675             # text sits ON the image, no plate box
    GX, GY = 240, 170
    COLS = 6
    ay = maxy + 420
    elements.append(mktext('apx-title', 0, ay - 200, 'Appendix — every command, illustrated', 64, '#e8e2d0'))

    CHALK = '/System/Library/Fonts/Supplemental/Chalkduster.ttf'

    def bake_caption(cmd, tier, what, ex, W=1600, H=900):
        """Bake command + what + example into a darkened bottom band of the scene."""
        from PIL import ImageDraw, ImageFont
        import textwrap
        img = Image.open(f'{SCENES}/{cmd}.png').convert('RGB').resize((W, H))
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        for i in range(230):
            a = int(205 * (i / 230) ** 1.3)
            od.line([(0, H - 230 + i), (W, H - 230 + i)], fill=(10, 13, 11, a))
        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
        d = ImageDraw.Draw(img)
        f_cmd = ImageFont.truetype(CHALK, 40)
        f_txt = ImageFont.truetype(CHALK, 28)
        f_ex = ImageFont.truetype(CHALK, 25)
        ty = H - 205
        disp = f'/{cmd}'
        d.text((28, ty), disp, font=f_cmd, fill=(150, 170, 255))
        if tier:
            d.text((28 + f_cmd.getlength(disp) + 22, ty + 8), tier,
                   font=ImageFont.truetype(CHALK, 24), fill=(140, 155, 140))
        yy = ty + 58
        for line in textwrap.wrap(what, 88)[:2]:
            d.text((28, yy), line, font=f_txt, fill=(240, 233, 216))
            yy += 37
        if ex:
            for line in textwrap.wrap(ex, 94)[:1]:
                d.text((28, yy + 6), line, font=f_ex, fill=(140, 226, 176))
        return img

    for idx, name in enumerate(names):
        col, row = idx % COLS, idx // COLS
        x = col * (FW + GX)
        y = ay + row * (FH + GY + 110)
        det = details.get(name, {})
        tier = det.get('tier') or ''
        what = (det.get('what') or '').strip()
        ex = (det.get('example') or '').strip()
        # bake fresh from details so edited explanations always flow through
        banded = bake_caption(name, tier, what, ex)
        banded.save(f'{LIB}/{name}.png')  # refresh the captioned library copy too
        buf = io.BytesIO(); banded.save(buf, 'JPEG', quality=82)
        # content-derived fileId: stale browser caches keyed by old ids can't shadow rebaked art
        fid = 'apximg-' + hashlib.sha1(name.encode() + buf.getvalue()).hexdigest()[:16]
        files[fid] = {"id": fid, "mimeType": "image/jpeg",
                      "dataURL": 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode(),
                      "created": 1}
        frame_id = f'apx-frame-{name}'
        elements.append(mkframe(frame_id, x, y, name, FW, FH))
        elements.append({"id": f'apx-img-{name}', "type": "image", "x": x, "y": y, "width": FW, "height": IMG_H,
                         "angle": 0, "strokeColor": "transparent", "backgroundColor": "transparent",
                         "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid", "roughness": 1,
                         "opacity": 100, "groupIds": [], "frameId": frame_id, "roundness": None,
                         "seed": 4, "version": 1, "versionNonce": 5, "isDeleted": False,
                         "boundElements": [], "crop": None, "updated": 1, "link": None, "locked": False,
                         "fileId": fid, "status": "saved", "scale": [1, 1]})
    deck['elements'] = elements
    deck['files'] = files

    payload = json.dumps(deck)
    mb = len(payload.encode()) / 1e6
    if mb > MAX_MB:
        print(f"REFUSED: {mb:.1f} MB exceeds {MAX_MB} MB gate")
        sys.exit(1)
    with open(OUT, 'w') as f:
        f.write(payload)
    frames = sum(1 for e in elements if e.get('type') == 'frame')
    print(f"OK {OUT}: {frames} frames, {mb:.1f} MB")

if __name__ == '__main__':
    main()