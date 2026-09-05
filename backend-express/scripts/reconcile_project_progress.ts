/**
 * Repairs only persisted project percentages that violate the WBS invariant.
 *
 * A project without any Main Task has no measurable WBS progress and must be
 * 0%. This intentionally leaves valid Main/Weekly/Daily records untouched;
 * normal API mutations maintain their bottom-up roll-up independently.
 */
import prisma from '../src/config/database';

type OrphanProject = { id: string; project_name: string; progress_percent: unknown };

/** Resets orphan project progress atomically and verifies the same invariant. */
async function main(): Promise<void> {
  const orphanProjects = await prisma.$queryRaw<OrphanProject[]>`
    SELECT p.id, p.project_name, p.progress_percent
    FROM project_project p
    WHERE coalesce(p.progress_percent, 0) <> 0
      AND NOT EXISTS (SELECT 1 FROM project_main_task mt WHERE mt.project_id = p.id)
  `;

  // IDs come directly from the database audit above. Restricting the update to
  // this exact set avoids modifying legitimate WBS progress elsewhere.
  if (orphanProjects.length > 0) {
    await prisma.project_project.updateMany({
      where: { id: { in: orphanProjects.map((project) => project.id) } },
      data: { progress_percent: 0, updated_at: new Date() },
    });
  }

  const remaining = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count
    FROM project_project p
    WHERE coalesce(p.progress_percent, 0) <> 0
      AND NOT EXISTS (SELECT 1 FROM project_main_task mt WHERE mt.project_id = p.id)
  `;
  const violations = Number(remaining[0]?.count ?? 0);
  if (violations !== 0) throw new Error(`Masih ada ${violations} project tanpa Main Task dengan progress non-zero.`);

  console.log(JSON.stringify({
    status: 'PASS',
    repaired: orphanProjects.map((project) => ({
      id: project.id,
      name: project.project_name,
      previous_progress: Number(project.progress_percent ?? 0),
      current_progress: 0,
    })),
    orphan_progress_remaining: violations,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
