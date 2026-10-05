# -*- coding: utf-8 -*-
"""生成程序图标：深绿圆角底 + 白色水滴 + 叶片"""
from PIL import Image, ImageDraw

S = 512
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

# 圆角底
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=104, fill=(31, 92, 46, 255))
# 内描边
d.rounded_rectangle([30, 30, S - 30, S - 30], radius=86, outline=(255, 255, 255, 60), width=8)

# 水滴
cx, cy = S // 2, 300
d.ellipse([cx - 92, cy - 76, cx + 92, cy + 108], fill=(255, 255, 255, 255))
d.polygon([(cx, cy - 210), (cx - 78, cy - 20), (cx + 78, cy - 20)], fill=(255, 255, 255, 255))
d.ellipse([cx + 16, cy - 40, cx + 54, cy - 2], fill=(160, 205, 170, 255))  # 高光

# 叶片（右下角小点缀）
d.ellipse([cx + 40, cy + 60, cx + 150, cy + 132], fill=(150, 205, 120, 255))
d.line([(cx + 48, cy + 126), (cx + 142, cy + 66)], fill=(31, 92, 46, 255), width=9)

out = r"D:\灵巧手图片\水培助手\public\icon.ico"
im.save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
im.resize((256, 256), Image.LANCZOS).save(r"D:\灵巧手图片\水培助手\_icon_preview.png")
print("图标已生成:", out)
