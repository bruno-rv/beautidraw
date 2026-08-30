#!/usr/bin/env python3
"""Shared contract for the Claude Code Commands native .excalidraw deck.

Every frame is 1920x1080. Frames are laid out in a horizontal filmstrip,
one per slide, so Excalidraw presentation mode plays them in order.

Usage (each subagent):
    import sys; sys.path.insert(0, '<this dir>')
    from deck_lib import new_element, el_id, emit_frame, FRAMES_DIR
"""
from __future__ import annotations
import json, time, random, hashlib
from pathlib import Path

DECK_DIR = Path(__file__).resolve().parent
FRAMES_DIR = DECK_DIR / "frames"
FRAMES_DIR.mkdir(parents=True, exist_ok=True)

# ---- clawd palette (matches premium-presentations clawd theme) ----
PAPER      = "#f4ede2"   # viewBackgroundColor / slide bg
SURFACE    = "#faf6ee"   # card bg
INK        = "#3e372c"   # primary graphite text
INK_DIM    = "#8a7f6d"   # secondary text
ORANGE     = "#c9571a"   # burnt-orange accent (accent-strong)
ORANGE_SOFT= "#f6d8c4"   # orange fill
GOLD       = "#b48a2e"   # gold (headings / kicker)
GREEN      = "#5e9c76"   # green accent (one-away / success)
GREEN_SOFT = "#dcead9"
PURPLE     = "#7d6bab"
PURPLE_SOFT= "#e6dff2"
RED        = "#b34430"
LINE       = "#d8cdc0"   # hairline borders
CODE_BG    = "#efe7db"

FRAME_W, FRAME_H = 1920, 1080

MARGIN = 96
KICKER_Y = 150          # small orange kicker top-left
TITLE_Y  = 210          # big title below kicker
BODY_Y   = 420          # content zone start
FOOTER_Y = FRAME_H - 70

# ---- element factory ----
_counter = {"n": 0}

def el_id(prefix: str) -> str:
    _counter["n"] += 1
    return f"{prefix}-{_counter['n']:03d}"

def new_element(type: str, x, y, w=0, h=0, *, stroke=INK, bg="transparent",
                fill="solid", width=2, roughness=1, opacity=100, seed=None,
                roundness=None, text="", font_size=28, font_family=5,
                text_align="left", vertical_align="top", label=None,
                points=None, start=None, end=None, frame_id=None) -> dict:
    """One factory for every element type. `label` -> text bound inside a shape."""
    e = {
        "type": type, "id": el_id(type), "x": x, "y": y,
        "width": w, "height": h, "angle": 0,
        "strokeColor": stroke, "backgroundColor": bg,
        "fillStyle": fill, "strokeWidth": width, "strokeStyle": "solid",
        "roughness": roughness, "opacity": opacity, "groupIds": [],
        "frameId": frame_id, "roundness": roundness or ({"type": 3} if type == "rectangle" else None),
        "seed": seed or random.randint(1, 2**31 - 1),
        "version": 1, "versionNonce": seed or 1, "isDeleted": False,
        "boundElements": [], "updated": int(time.time() * 1000), "link": None,
        "locked": False,
    }
    if type in ("rectangle", "diamond", "ellipse"):
        e["index"] = None
    if type in ("arrow", "line"):
        e["points"] = points or [[0, 0]]
        e["lastCommittedPoint"] = None
        e["elbowed"] = False
        e.pop("roundness", None) or e.update(roundness={"type": 2})
        e["roundness"] = {"type": 2}
        if type == "arrow":
            e["startBinding"] = None
            e["endBinding"] = None
            e["lastCommittedPoint"] = None
            e["startArrowhead"] = None
            e["endArrowhead"] = "triangle"
    if type == "text":
        e.update({
            "text": text, "fontSize": font_size, "fontFamily": font_family,
            "textAlign": text_align, "verticalAlign": vertical_align,
            "containerId": None, "originalText": text, "autoResize": True,
            "lineHeight": 1.25, "baseline": y + font_size,
        })
    if label is not None:  # text bound inside a container (rect/diamond/arrow)
        t = new_element("text", x, y, w, h, text=label, font_size=font_size,
                        font_family=font_family, text_align=text_align,
                        vertical_align=vertical_align, seed=seed)
        t["containerId"] = e["id"]; t["x"] = x; t["y"] = y
        t["width"] = w - 24; t["height"] = font_size * 1.25 * max(1, label.count("\n") + 1)
        e["boundElements"] = [{"id": t["id"], "type": "text"}]
        e["_label"] = t
    return e

def el_id_reset():
    _counter["n"] = 0

# ---- scene emitter ----
def emit_frame(slide_no: int, elements: list, *, view_bg: str = PAPER) -> Path:
    """Validate + write frames/slide-NN.excalidraw. Returns path."""
    els = []
    texts_for_bind = []
    flat = []
    def walk(e):
        if isinstance(e, dict) and "_label" in e:
            lbl = e.pop("_label")
            flat.append(e); flat.append(lbl)
            # bind arrow endpoints crudely: none (positions fixed manually)
        else:
            flat.append(e)
    for e in elements:
        walk(e)
    # frames need their own element
    frame = {
        "type": "frame", "id": f"frame-slide-{slide_no:02d}",
        "x": (slide_no - 1) * (FRAME_W + 80), "y": 0,
        "width": FRAME_W, "height": FRAME_H,
        "name": f"{slide_no:02d}", "opacity": 100, "isDeleted": False,
        "version": 1, "updated": int(time.time() * 1000),
    }
    # rebase element coords into the frame
    for e in flat:
        if e.get("frameId") is None and e.get("type") != "frame":
            e["frameId"] = frame["id"]
            e["x"] += frame["x"]
    scene = {
        "type": "excalidraw", "version": 2,
        "source": "beautidraw/claude-code-commands",
        "elements": [frame] + flat,
        "appState": {"viewBackgroundColor": view_bg, "gridSize": None,
                      "exportEmbedScene": True},
        "files": {},
    }
    out = FRAMES_DIR / f"slide-{slide_no:02d}.excalidraw"
    out.write_text(json.dumps(scene, indent=1))
    return out

def footer(slide_no: int, total: int = 19) -> list:
    """Standard slide footer: page num right, anchor phrase left."""
    _counter["n"] += 1; n = _counter["n"]
    pg = new_element("text", 0, 0, text=f"{slide_no} / {total}", font_size=22,
                     stroke=INK_DIM, text_align="right", seed=n)
    pg["x"] = MARGIN + (FRAME_W - 2 * MARGIN) - 10 - pg_w(pg)
    pg["y"] = FOOTER_Y
    _counter["n"] += 1; n2 = _counter["n"]
    note = new_element("text", 0, 0, text="one /help away", font_size=22,
                       stroke=INK_DIM, seed=n2)
    note["x"] = MARGIN; note["y"] = FOOTER_Y
    return [pg, note]

def pg_w(t):
    return max(len(l) for l in t["text"].split("\n")) * t["fontSize"] * 0.58

def kicker(text: str) -> dict:
    e = new_element("text", MARGIN, KICKER_Y, text=text.upper(), font_size=24,
                    stroke=ORANGE, font_family=5)
    return e

def title(text: str, size=88, y=None) -> dict:
    e = new_element("text", MARGIN, y or TITLE_Y, text=text, font_size=size,
                    stroke=INK, font_family=5)
    return e