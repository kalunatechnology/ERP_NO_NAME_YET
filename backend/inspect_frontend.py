import os
import re
import json

frontend_dir = r"d:\projectku\Arsalynt\erp\brain strorming\ERP_NO_NAME_YET\frontend-next"
api_calls = set()
api_files = {}
pattern = re.compile(r'[\'"`](/api/v1/[^\'"`?]+|/api/[^\'"`?]+)[\'"`]')

for root, dirs, files in os.walk(frontend_dir):
    if "node_modules" in dirs:
        dirs.remove("node_modules")
    if ".next" in dirs:
        dirs.remove(".next")
    for f in files:
        if f.endswith((".ts", ".tsx", ".js", ".jsx")):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as file:
                content = file.read()
                matches = pattern.findall(content)
                for m in matches:
                    api_calls.add(m)
                    if m not in api_files:
                        api_files[m] = []
                    rel_path = os.path.relpath(path, frontend_dir)
                    api_files[m].append(rel_path)

with open("frontend_api_audit.json", "w", encoding="utf-8") as f:
    json.dump(api_files, f, indent=2)

print(f"Total frontend API call endpoints found: {len(api_calls)}")
for ep in sorted(api_calls):
    print(f"  {ep} -> used in {len(api_files[ep])} files")
