import assert from 'node:assert/strict';
import { projects, users } from '../prisma/seed.production';

function dateValue(value: string | null): number {
  return value ? new Date(`${value}T00:00:00+07:00`).getTime() : Number.POSITIVE_INFINITY;
}

async function main(): Promise<void> {
  const companyUsers = users.filter((user) => !user.global);
  assert(companyUsers.every((user) => user.roleCodes.includes('ROLE-STAFF')), 'Every company user must explicitly inherit ROLE-STAFF.');
  assert.equal(new Set(projects.map((project) => project.code)).size, projects.length, 'Project codes must be unique.');
  assert.equal(projects.length, 7);

  const weeklyByOwner = new Map<string, number>();
  const dailyByOwner = new Map<string, number>();
  let mainTaskCount = 0;
  let weeklyTaskCount = 0;
  let dailyTaskCount = 0;

  for (const project of projects) {
    assert(users.some((user) => user.username === project.manager), `Missing manager ${project.manager}.`);
    for (const mainTask of project.mainTasks) {
      mainTaskCount += 1;
      assert(dateValue(mainTask.due) <= dateValue(project.deadline), `${mainTask.title}: Main Task deadline exceeds Project deadline.`);
      for (const weeklyTask of mainTask.weekly) {
        weeklyTaskCount += 1;
        weeklyByOwner.set(weeklyTask.assignee, (weeklyByOwner.get(weeklyTask.assignee) ?? 0) + 1);
        assert(mainTask.assignees.includes(weeklyTask.assignee), `${weeklyTask.title}: Weekly owner must be assigned to its Main Task.`);
        assert(dateValue(weeklyTask.end) <= dateValue(mainTask.due), `${weeklyTask.title}: Weekly deadline exceeds Main Task deadline.`);
        for (const dailyTask of weeklyTask.daily) {
          dailyTaskCount += 1;
          dailyByOwner.set(dailyTask.owner, (dailyByOwner.get(dailyTask.owner) ?? 0) + 1);
          assert.equal(dailyTask.owner, weeklyTask.assignee, `${dailyTask.title}: Daily owner must own the Weekly Task.`);
          assert(dateValue(dailyTask.date) <= dateValue(weeklyTask.end), `${dailyTask.title}: Daily date exceeds Weekly deadline.`);
        }
      }
    }
  }

  for (const user of companyUsers) {
    assert((weeklyByOwner.get(user.username) ?? 0) > 0, `${user.username} needs a personal Weekly Task for Daily Task creation.`);
    assert((dailyByOwner.get(user.username) ?? 0) > 0, `${user.username} needs at least one personal Daily Task.`);
  }

  assert.deepEqual(
    { mainTaskCount, weeklyTaskCount, dailyTaskCount },
    { mainTaskCount: 7, weeklyTaskCount: 12, dailyTaskCount: 26 },
  );

  console.log(JSON.stringify({
    status: 'PASS',
    companyUsers: companyUsers.length,
    projects: projects.length,
    mainTaskCount,
    weeklyTaskCount,
    dailyTaskCount,
    activeProjectSupervisors: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
