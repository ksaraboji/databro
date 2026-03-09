from PIL import Image, ImageDraw, ImageFont
import io
import httpx
import asyncio

async def test_text():
    size = (1080, 1920)
    text = "Did you know? Go is a statically typed, compiled programming language designed at Google."
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    resp = await httpx.AsyncClient(follow_redirects=True).get("https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf")
    font = ImageFont.truetype(io.BytesIO(resp.content), 80)

    lines = []
    words = text.split()
    current_line = []
    
    for word in words:
        current_line.append(word)
        line_w = draw.textlength(" ".join(current_line), font=font) if hasattr(draw, 'textlength') else 50 * len(current_line)
        if line_w > size[0] * 0.8:
            lines.append(" ".join(current_line[:-1]))
            current_line = [word]
    if current_line:
        lines.append(" ".join(current_line))
    
    print("Lines:", lines)

asyncio.run(test_text())
