import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== UPDATING REAL USER EMAILS TO .COM AND FIRST NAMES ===');

  const updates = [
    { oldEmail: 'rian.destianto@arsalynk.id', newEmail: 'rian@arsalynk.com', username: 'rian' },
    { oldEmail: 'melika.citra@arsalynk.id', newEmail: 'melika@arsalynk.com', username: 'melika' },
    { oldEmail: 'melika.ops@arsalynk.id', newEmail: 'melika.ops@arsalynk.com', username: 'melika.ops' },
    { oldEmail: 'arof.fudding@arsalynk.id', newEmail: 'arof@arsalynk.com', username: 'arof' },
    { oldEmail: 'arof.finance@arsalynk.id', newEmail: 'arof.finance@arsalynk.com', username: 'arof.finance' },
    { oldEmail: 'laode.fahmi@arsalynk.id', newEmail: 'laode@arsalynk.com', username: 'laode' },
    { oldEmail: 'jundy.isham@arsalynk.id', newEmail: 'jundy@arsalynk.com', username: 'jundy' },
    { oldEmail: 'noorman.perdana@arsalynk.id', newEmail: 'noorman@arsalynk.com', username: 'noorman' },
  ];

  for (const u of updates) {
    const user = await prisma.iam_user.findFirst({
      where: { OR: [{ email: u.oldEmail }, { email: u.newEmail }, { username: u.username }] },
    });

    if (user) {
      await prisma.iam_user.update({
        where: { id: user.id },
        data: {
          email: u.newEmail,
          username: u.username,
        },
      });
      console.log(`Updated user: ${u.username} -> ${u.newEmail}`);
    }
  }

  console.log('=== USER EMAILS UPDATED TO .COM SUCCESSFULLY ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
