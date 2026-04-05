import httpx
import asyncio

async def main():
    resp = await httpx.AsyncClient().get("https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf")
    print("Status:", resp.status_code)
    print("Length:", len(resp.content))

asyncio.run(main())
