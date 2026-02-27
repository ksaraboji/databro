import urllib.request
import json
import re

env_file = "/home/mechianz/databro/.env.local"
with open(env_file) as f:
    text = f.read()

token = re.search(r"HF_API_KEY=(.+)", text).group(1).strip() if "HF_API_KEY" in text else None
print("Token loaded:", bool(token))

url = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
data = json.dumps({"inputs": "A futuristic server room"}).encode('utf-8')

req = urllib.request.Request(url, data=data, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Success")
except Exception as e:
    if hasattr(e, 'read'): print("Error:", e.read().decode())
    else: print("Error:", e)
