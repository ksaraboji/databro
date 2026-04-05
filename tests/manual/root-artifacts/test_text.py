from PIL import Image, ImageDraw, ImageFont
import io
import httpx
import asyncio

async def main():
    img = Image.new("RGBA", (1080, 1920), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    resp = await httpx.AsyncClient().get("https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf")
    font = ImageFont.truetype(io.BytesIO(resp.content), 80)
    try:
        draw.text((100, 100), "Hello World", fill=(255,255,255), font=font, stroke_width=4, stroke_fill=(0,0,0))
        print("Success drawing text")
    except Exception as e:
        print("Error drawing text", type(e), e)

asyncio.run(main())
