import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from django.apps import apps
from django.db import models

TYPE_MAP = {
    'UUIDField': 'String',
    'CharField': 'String',
    'TextField': 'String',
    'EmailField': 'String',
    'SlugField': 'String',
    'URLField': 'String',
    'FilePathField': 'String',
    'GenericIPAddressField': 'String',
    'IntegerField': 'Int',
    'SmallIntegerField': 'Int',
    'PositiveIntegerField': 'Int',
    'PositiveSmallIntegerField': 'Int',
    'BigIntegerField': 'BigInt',
    'PositiveBigIntegerField': 'BigInt',
    'BigAutoField': 'BigInt',
    'AutoField': 'Int',
    'BooleanField': 'Boolean',
    'NullBooleanField': 'Boolean',
    'FloatField': 'Float',
    'DecimalField': 'Decimal',
    'DateTimeField': 'DateTime',
    'DateField': 'DateTime',
    'TimeField': 'String',
    'DurationField': 'BigInt',
    'JSONField': 'Json',
    'BinaryField': 'Bytes',
}

header = """// Prisma Schema for ERP Backend (Express + TypeScript)
// 100% Behavioral and Structural Parity with Django REST Framework

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

"""

lines = [header]

for app in apps.get_app_configs():
    if not app.name.startswith('apps.'):
        continue
    app_models = list(app.get_models())
    if not app_models:
        continue
    
    lines.append(f"\n// =============================================================================")
    lines.append(f"// APP: {app.label.upper()} ({len(app_models)} models)")
    lines.append(f"// =============================================================================\n")
    
    for m in app_models:
        model_name = m._meta.db_table  # Use table name as Prisma model identifier for exact matching
        # Clean model name for Prisma model identifier (valid identifier)
        prisma_model_name = m._meta.db_table.replace('-', '_')
        
        lines.append(f"model {prisma_model_name} {{")
        
        fields = []
        has_id = False
        
        for f in m._meta.concrete_fields:
            field_name = f.column if hasattr(f, 'column') and f.column else f.name
            internal_type = f.get_internal_type() if hasattr(f, 'get_internal_type') else f.__class__.__name__
            prisma_type = TYPE_MAP.get(internal_type, 'String')
            
            # Modifier: optional
            is_pk = getattr(f, 'primary_key', False)
            if is_pk:
                has_id = True
            is_null = getattr(f, 'null', False) and not is_pk
            type_str = f"{prisma_type}?" if is_null else prisma_type
            
            attributes = []
            if is_pk:
                if internal_type == 'UUIDField':
                    attributes.append("@id @default(uuid())")
                elif internal_type in ('AutoField', 'BigAutoField', 'SmallAutoField'):
                    attributes.append("@id @default(autoincrement())")
                else:
                    attributes.append("@id")
            
            if getattr(f, 'unique', False) and not is_pk:
                attributes.append("@unique")
                
            if field_name != f.name:
                attributes.append(f'@map("{f.column}")')
                
            attr_str = " " + " ".join(attributes) if attributes else ""
            lines.append(f"  {field_name:<28} {type_str}{attr_str}")
            
        if not has_id:
            # Fallback if no pk detected
            lines.append("  id                           String   @id @default(uuid())")
            
        lines.append(f'  @@map("{m._meta.db_table}")')
        lines.append("}\n")

output_path = r"d:\projectku\Arsalynt\erp\brain strorming\ERP_NO_NAME_YET\backend-express\prisma\schema.prisma"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Prisma schema successfully written to {output_path}")
