import json

with open('backend_model_audit.json', encoding='utf-8') as f:
    models = json.load(f)

mapping = {}
for app, m_dict in models.items():
    mapping[app] = {}
    for m_name, info in m_dict.items():
        mapping[app][m_name] = {
            "table": info["db_table"],
            "fields": [field["name"] for field in info["fields"]]
        }

with open("model_db_table_mapping.json", "w", encoding="utf-8") as f:
    json.dump(mapping, f, indent=2)

print("Mapping dumped successfully.")
