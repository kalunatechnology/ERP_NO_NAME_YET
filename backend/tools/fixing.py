from __future__ import annotations

from pathlib import Path
import shutil
import sys


TARGETS = (
    (
        Path("apps/projects/api/serializers.py"),
        "ProjectBudgetLine",
    ),
    (
        Path("apps/finance/api/serializers.py"),
        "FinanceBudgetLine",
    ),
)


def ensure_import(source: str) -> str:
    import_line = "from drf_spectacular.utils import extend_schema_serializer\n"

    if import_line.strip() in source:
        return source

    lines = source.splitlines(keepends=True)
    insert_at = 0

    if lines and lines[0].startswith("from __future__ import"):
        insert_at = 1
        while insert_at < len(lines) and not lines[insert_at].strip():
            insert_at += 1

    lines.insert(insert_at, import_line)
    return "".join(lines)


def apply_component_name(source: str, component_name: str) -> tuple[str, bool]:
    marker = "class BudgetLineSerializer("
    index = source.find(marker)

    if index < 0:
        return source, False

    decorator = (
        f'@extend_schema_serializer(component_name="{component_name}")\n'
    )

    before = source[:index]
    if decorator.strip() in before[-300:]:
        return source, True

    return source[:index] + decorator + source[index:], True


def patch_file(path: Path, component_name: str) -> None:
    if not path.exists():
        raise FileNotFoundError(
            f"File tidak ditemukan: {path}. Jalankan script dari root backend."
        )

    original = path.read_text(encoding="utf-8")
    updated_source = ensure_import(original)
    updated_source, found = apply_component_name(
        updated_source,
        component_name,
    )

    if not found:
        raise RuntimeError(
            f"Class BudgetLineSerializer tidak ditemukan di {path}."
        )

    if updated_source == original:
        print(f"[SKIP] {path}: patch sudah terpasang.")
        return

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        shutil.copy2(path, backup)

    path.write_text(updated_source, encoding="utf-8")
    print(f"[OK] {path}")
    print(f"     Backup: {backup}")


def main() -> int:
    try:
        for path, component_name in TARGETS:
            patch_file(path, component_name)
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    print("\nPatch BudgetLine OpenAPI selesai.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())