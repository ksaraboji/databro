import urllib.request
import json
import re

with open("/home/mechianz/databro/.env.local") as f: text = f.read()
token = re.search(r"HF_API_KEY=(.+)", text).group(1).strip()
url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"

req = urllib.request.Request(url, data=json.dumps({"inputs": "A test"}).encode('utf-8'), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
except Exception as e:
    print("Error:", e.read().decode() if hasattr(e, 'read') else e)
