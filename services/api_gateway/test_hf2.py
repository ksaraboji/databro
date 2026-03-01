import asyncio
from marketing import generate_image_hf, HF_API_KEY
print("KEY:", bool(HF_API_KEY))

async def main():
    print("Testing image gen...")
    try:
        res = await generate_image_hf("A beautiful landscape")
        if res:
            print("Success, bytes:", len(res))
        else:
            print("Returned None")
    except Exception as e:
        print("Crash:", e)

asyncio.run(main())
