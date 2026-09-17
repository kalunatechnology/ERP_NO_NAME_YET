from pathlib import Path

patch = Path(__file__).with_name('apply_task_multitenant_integrity_patch.mjs')
text = patch.read_text(encoding='utf-8')

replacements = {
    "    const employeeNumber = `EMP-${userId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;":
        "    const employeeNumber = 'EMP-' + userId.replace(/-/g, '').slice(0, 12).toUpperCase();",
    "      console.warn(`[skip main] ${task.id}: parent project scope incomplete`);":
        "      console.warn('[skip main] ' + task.id + ': parent project scope incomplete');",
    "      console.warn(`[skip weekly] ${task.id}: parent main task scope incomplete`);":
        "      console.warn('[skip weekly] ' + task.id + ': parent main task scope incomplete');",
    "      console.warn(`[skip daily] ${task.id}: parent weekly task scope incomplete`);":
        "      console.warn('[skip daily] ' + task.id + ': parent weekly task scope incomplete');",
    "      console.warn(`[skip assignment] ${assignment.id}: parent main task scope incomplete`);":
        "      console.warn('[skip assignment] ' + assignment.id + ': parent main task scope incomplete');",
    "      console.error(`[failed] user=${membership.user_id}`, error);":
        "      console.error('[failed] user=' + membership.user_id, error);",
}

for old, new in replacements.items():
    if old in text:
        text = text.replace(old, new)
    elif new not in text:
        raise SystemExit(f'Expected patch text not found: {old}')

patch.write_text(text, encoding='utf-8')
print('Patch generator quoting repaired.')
