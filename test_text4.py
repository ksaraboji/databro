import httpx
import asyncio

async def main():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        resp = await client.get("https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf")
        print("Status with redirect:", resp.status_code)
        print("Length with redirect:", len(resp.content))

asyncio.run(main())
