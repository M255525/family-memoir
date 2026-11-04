from PIL import Image, ImageDraw, ImageFont
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
GREEN, RED, PAPER, GOLD = (47, 107, 94, 255), (185, 38, 29, 255), (252, 251, 245, 255), (251, 231, 174, 255)
def draw(size, pad=0.0, rounded=True):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .2), fill=GREEN)
    else:
        d.rectangle([0, 0, S, S], fill=GREEN)
    k = 1 - pad * 2
    P = lambda x, y: (S * (pad + x * k), S * (pad + y * k))
    a, b = P(.2, .14), P(.8, .86)
    d.rectangle([a[0], a[1], b[0], b[1]], fill=PAPER)
    a2, b2 = P(.2, .14), P(.8, .31)
    d.rectangle([a2[0], a2[1], b2[0], b2[1]], fill=RED)
    font = ImageFont.truetype('C:/Windows/Fonts/kaiu.ttf', int(S * .4 * k))
    c = P(.5, .585)
    d.text(c, '憶', font=font, fill=(35, 79, 70, 255), anchor='mm')
    for x in (.36, .64):
        p = P(x, .225)
        r = S * .022 * k
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, pad=.1, rounded=False).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('ok')
