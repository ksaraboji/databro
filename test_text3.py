from PIL import Image, ImageDraw, ImageFont
img = Image.new("RGBA", (100, 100))
draw = ImageDraw.Draw(img)
font = ImageFont.load_default()
try:
    draw.text((10,10), "Test", font=font, stroke_width=4, stroke_fill=(0,0,0))
    print("Success")
except Exception as e:
    print("Fails:", type(e), e)
