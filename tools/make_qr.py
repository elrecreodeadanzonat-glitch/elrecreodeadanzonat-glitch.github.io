"""Generate the permanent QR for Libro de mamá and verify it decodes to EXACTLY the canonical URL.

Outputs (in qr/):
  libro-de-mama-QR.png           QR only, >= 1500 px, black on white, 4-module quiet zone, error correction H
  libro-de-mama-QR.svg           same QR as vector
  libro-de-mama-QR-imprimir.png  print version with "Libro de mamá" below, outside the quiet zone
  libro-de-mama-QR-imprimir.svg  print version as vector
"""
import math, os, re, subprocess, sys
import numpy as np
import cv2
import segno
from PIL import Image, ImageDraw, ImageFont

URL = "https://elrecreodeadanzonat-glitch.github.io/"
OUT = os.path.join(os.path.dirname(__file__), "..", "qr")
os.makedirs(OUT, exist_ok=True)
BORDER = 4

qr = segno.make(URL, error="h", micro=False, boost_error=False)
modules = qr.symbol_size(scale=1, border=BORDER)[0]
scale = math.ceil(1600 / modules)
print(f"version {qr.version}, error {qr.error}, {modules} modules incl. quiet zone, scale {scale} -> {modules * scale}px")

png = os.path.join(OUT, "libro-de-mama-QR.png")
svg = os.path.join(OUT, "libro-de-mama-QR.svg")
qr.save(png, scale=scale, border=BORDER, dark="#000000", light="#ffffff")
qr.save(svg, scale=10, border=BORDER, dark="#000000", light="#ffffff", title="Libro de mamá — " + URL, svgclass=None, lineclass=None)

# print version (PNG): QR with its quiet zone, then the title below, outside the code area
qr_img = Image.open(png).convert("RGB")
S = qr_img.width
font_path = next((p for p in ["C:/Windows/Fonts/georgiai.ttf", "C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/times.ttf"] if os.path.exists(p)), None)
font = ImageFont.truetype(font_path, int(S * 0.075)) if font_path else ImageFont.load_default()
text = "Libro de mamá"
tb = ImageDraw.Draw(qr_img).textbbox((0, 0), text, font=font)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
pad_bottom = int(S * 0.08)
canvas = Image.new("RGB", (S, S + th + pad_bottom), "white")
canvas.paste(qr_img, (0, 0))
d = ImageDraw.Draw(canvas)
d.text(((S - tw) / 2 - tb[0], S - tb[1]), text, fill="black", font=font)
png_print = os.path.join(OUT, "libro-de-mama-QR-imprimir.png")
canvas.save(png_print, dpi=(300, 300))

# print version (SVG): reuse the QR path, extend the canvas downwards and add the title
src = open(svg, encoding="utf-8").read()
m = re.search(r'width="(\d+)" height="(\d+)"', src)
w, h = int(m.group(1)), int(m.group(2))
extra = int(w * 0.16)
body = src[src.index(">", src.index("<svg")) + 1: src.rindex("</svg>")]
svg_print = os.path.join(OUT, "libro-de-mama-QR-imprimir.svg")
with open(svg_print, "w", encoding="utf-8") as f:
    f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h + extra}" viewBox="0 0 {w} {h + extra}">'
            f'<rect width="{w}" height="{h + extra}" fill="#ffffff"/>{body}'
            f'<text x="{w / 2}" y="{h + extra * 0.45}" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-style="italic" '
            f'font-size="{w * 0.075:.1f}" fill="#000000">Libro de mamá</text></svg>\n')


# ---------------- verification ----------------
det = cv2.QRCodeDetector()


def decode(img):
    val, pts, _ = det.detectAndDecode(img)
    return val


def check(label, img):
    val = decode(img)
    ok = val == URL
    print(f"  {label:48s} -> {val!r}  {'OK' if ok else 'MISMATCH'}")
    return ok


CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def rasterize_svg(path):
    """Render the SVG with headless Chrome (a real SVG engine) and return the screenshot."""
    out = os.path.abspath(path) + ".check.png"
    url = "file:///" + os.path.abspath(path).replace("\\", "/")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1400,1700",
                    "--default-background-color=ffffffff", f"--screenshot={out}", url],
                   check=True, capture_output=True)
    img = cv2.imread(out)
    os.remove(out)
    return img


results = []
print("Decoding checks:")
base = cv2.imread(png)
results.append(check("QR PNG (full size)", base))
results.append(check("QR PNG print version", cv2.imread(png_print)))
for px in (600, 300, 180):
    results.append(check(f"QR PNG downscaled to {px}px (phone-distance sim)", cv2.resize(base, (px, px), interpolation=cv2.INTER_AREA)))
blur = cv2.GaussianBlur(cv2.resize(base, (400, 400), interpolation=cv2.INTER_AREA), (0, 0), 1.6)
results.append(check("QR PNG 400px + blur (out-of-focus sim)", blur))
try:
    results.append(check("QR SVG rasterized", rasterize_svg(svg)))
    results.append(check("QR SVG print version rasterized", rasterize_svg(svg_print)))
except Exception as e:
    print("  SVG rasterization unavailable:", e)
    results.append(False)

print("PNG size:", Image.open(png).size, "| print PNG size:", Image.open(png_print).size)
print("ALL CHECKS PASSED" if all(results) else "SOME CHECKS FAILED")
sys.exit(0 if all(results) else 1)
