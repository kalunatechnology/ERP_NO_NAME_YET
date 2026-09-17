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

# The initial generator used a generic select replacement and could hit another
# project_main_task lookup earlier in the large route file. Replace that patch
# definition with an anchor scoped specifically to Daily Task creation.
old_selector_patch = """replaceExact(
  projectRoutesPath,
  `      select: { id: true, project_id: true },`,
  `      select: { id: true, project_id: true, tenant_id: true, company_id: true },`,
  `select: { id: true, project_id: true, tenant_id: true, company_id: true }`,
);"""

new_selector_patch = """replaceExact(
  projectRoutesPath,
  `    const mainTask = await prisma.project_main_task.findFirst({\\n      where: { id: weeklyTask.main_task_id, company_id: companyId },\\n      select: { id: true, project_id: true },\\n    });`,
  `    const mainTask = await prisma.project_main_task.findFirst({\\n      where: { id: weeklyTask.main_task_id, company_id: companyId },\\n      select: { id: true, project_id: true, tenant_id: true, company_id: true },\\n    });`,
  `where: { id: weeklyTask.main_task_id, company_id: companyId },\\n      select: { id: true, project_id: true, tenant_id: true, company_id: true }`,
);"""

if old_selector_patch in text:
    text = text.replace(old_selector_patch, new_selector_patch)
elif new_selector_patch not in text:
    raise SystemExit('Expected Daily Task selector patch definition not found')

patch.write_text(text, encoding='utf-8')
print('Patch generator quoting and Daily Task selector repaired.')
