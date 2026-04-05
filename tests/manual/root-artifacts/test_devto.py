import os
import httpx

DEVTO_API_KEY = os.getenv("DEVTO_API_KEY")

async def post_to_devto():
    url = "https://dev.to/api/articles"
    headers = {
        "api-key": DEVTO_API_KEY,
        "Content-Type": "application/json"
    }
    data = {
        "article": {
            "title": "Test Post",
            "published": False,
            "body_markdown": "Test body",
            "tags": ["test"],
            "main_image": "https://example.com/cover.jpg"
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=data)
        print(resp.status_code, resp.text)
