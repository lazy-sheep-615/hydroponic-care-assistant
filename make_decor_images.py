# -*- coding: utf-8 -*-
"""从用户自己拍的照片里裁出界面装饰图：两张植物头像 + 一张顶部横幅（模糊压暗）"""
import os
from PIL import Image, ImageEnhance, ImageFilter

OUT = r"D:\灵巧手图片\水培助手\public\img"
os.makedirs(OUT, exist_ok=True)

ATT = r"C:\Users\wu xu\.dsh\attachments\v1\objects"
SRC = {
    # 用户第一次发来的两张植物照片（附件按 sha256 命名）
    "luohansong": os.path.join(ATT, "9c", "9ce440fe242e3cf4f4adb298b2731922d38283139eb871ecec5c4381c21bb1b5"),
    "hongyan": os.path.join(ATT, "de", "de4333c3021f9e311496ec22cdf48480064c36fc43416ab62a93fc44e1785522"),
}
# 归一化副本可能没有扩展名，Pillow 按内容识别，没问题
for k, p in SRC.items():
    print(k, os.path.exists(p))

# ---- 1. 两张方形头像 ----
avatars = {
    "plant-luohansong.jpg": ("luohansong", (120, 120, 1660, 1660)),
    "plant-hongyan.jpg": ("hongyan", (140, 180, 1700, 1740)),
}
for name, (key, box) in avatars.items():
    im = Image.open(SRC[key]).convert("RGB")
    box = (box[0], box[1], min(box[2], im.width), min(box[3], im.height))
    c = im.crop(box).resize((420, 420), Image.LANCZOS)
    c = ImageEnhance.Color(c).enhance(1.06)
    c = ImageEnhance.Contrast(c).enhance(1.03)
    p = os.path.join(OUT, name)
    c.save(p, "JPEG", quality=86, optimize=True)
    print("  ->", p, os.path.getsize(p), "bytes")

# ---- 2. 顶部横幅：取红颜叶片的上半部，模糊 + 压暗 ----
im = Image.open(SRC["hongyan"]).convert("RGB")
w, h = im.size
band = im.crop((0, int(h * 0.10), w, int(h * 0.44)))     # 叶片最密的一段
band = band.resize((1400, int(1400 * band.height / band.width)), Image.LANCZOS)
band = band.filter(ImageFilter.GaussianBlur(11))
band = ImageEnhance.Brightness(band).enhance(0.55)   # 压暗，白字才压得住
band = ImageEnhance.Color(band).enhance(1.25)
p = os.path.join(OUT, "hero.jpg")
band.save(p, "JPEG", quality=74, optimize=True)
print("  ->", p, band.size, os.path.getsize(p), "bytes")
