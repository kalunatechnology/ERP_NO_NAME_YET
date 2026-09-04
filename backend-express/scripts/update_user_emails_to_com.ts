/**
 * File: backend-express/scripts/update_user_emails_to_com.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Reads or mutates Prisma model(s) `iam_user`.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
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

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
