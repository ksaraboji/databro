import asyncio
from services.api_gateway.marketing import create_text_layer

async def test():
    img = await create_text_layer("Did you know? Docker packages your entire application stack into a single container for consistent execution everywhere.", icon_name=None, size=(1080, 1920))
    img.save("test_marketing_text_layer.png")

asyncio.run(test())
