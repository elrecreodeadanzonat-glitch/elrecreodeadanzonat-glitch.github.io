"""Build web-optimised photos + public/gallery.json from the canonical ordered assets (001..034).

The numeric prefix is the canonical order. Nothing is re-ordered, cropped or retouched:
EXIF orientation is honoured, transparency is flattened on white, pixels are only resized/compressed.
"""
import json, os, re, sys
from datetime import datetime, timezone
from PIL import Image, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else "G:/Mi unidad/Libro de mamá - assets"
ROOT = os.path.join(os.path.dirname(__file__), "..")
PUB = os.path.join(ROOT, "public")
SIZES = {"full": 2200, "md": 1280, "thumb": 360}
QUALITY = {"full": 84, "md": 80, "thumb": 70}

files = sorted(f for f in os.listdir(SRC) if re.match(r"^\d{3}__.*\.(png|jpe?g|webp)$", f, re.I))
manifest = json.load(open(os.path.join(SRC, "gallery_manifest.json"), encoding="utf-8"))
expected = [it["filename"] for it in sorted(manifest["items"], key=lambda it: it["position"])]
assert files == expected, "files on disk do not match the manifest order"
assert len(files) == manifest["count"] == 34, len(files)

for d in SIZES:
    os.makedirs(os.path.join(PUB, "photos", d), exist_ok=True)

now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
photos = []
for pos, fname in enumerate(files, start=1):
    assert int(fname[:3]) == pos
    pid = f"p{pos:03d}"
    im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, fname)))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        if im.getextrema()[3][0] < 255:
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")
    w, h = im.size
    out = {}
    for kind, limit in SIZES.items():
        scale = min(1.0, limit / max(w, h))
        img = im if scale >= 1 else im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        rel = f"photos/{kind}/{pid}.webp"
        img.save(os.path.join(PUB, rel), "WEBP", quality=QUALITY[kind], method=6)
        out[kind] = (rel, img.size)
    small = im.resize((24, 24), Image.BILINEAR)
    px = list(small.getdata())
    r, g, b = (sum(p[i] for p in px) // len(px) for i in range(3))
    photos.append({
        "id": pid,
        "order": pos,
        "src": out["full"][0],
        "srcMd": out["md"][0],
        "thumb": out["thumb"][0],
        "width": out["full"][1][0],
        "height": out["full"][1][1],
        "color": f"#{r:02x}{g:02x}{b:02x}",
        "originalFilename": fname,
        "caption": "",
        "alt": f"Fotografía {pos} del Libro de mamá",
        "fitMode": "contain",
        "rotation": 0,
        "focalPoint": {"x": 0.5, "y": 0.5},
        "hidden": False,
        "createdAt": now,
    })
    kb = sum(os.path.getsize(os.path.join(PUB, v[0])) for v in out.values()) / 1024
    print(f"{pid} {fname:48s} {w}x{h} -> full {out['full'][1]} md {out['md'][1]} ({kb:.0f} KB total)")

gallery = {"version": 1, "revision": f"initial-{now}", "updatedAt": now, "photos": photos}
with open(os.path.join(PUB, "gallery.json"), "w", encoding="utf-8") as f:
    json.dump(gallery, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("gallery.json:", len(photos), "photos")
