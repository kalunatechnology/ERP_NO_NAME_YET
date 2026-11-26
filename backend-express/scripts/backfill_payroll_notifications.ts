import prisma from '../src/config/database';
import { PayrollService } from '../src/modules/finance/payroll.service';

function jakartaDate(value?: string): string {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00+07:00`))) {
      throw new Error('Tanggal harus memakai format YYYY-MM-DD.');
    }
    return value;
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

async function main() {
  const dateArg = process.argv.find((arg) => arg.startsWith('--date='))?.slice('--date='.length);
  const date = jakartaDate(dateArg);
  if (!process.argv.includes('--apply')) {
    throw new Error(`Backfill payroll notifikasi belum dijalankan. Tanggal target ${date}; ulangi dengan --apply untuk menyimpan notifikasi.`);
  }

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const result = await PayrollService.backfillGeneratedNotifications(start, end);
  process.stdout.write(`Payroll tanggal ${date}: ${result.payrollRuns} run diperiksa, ${result.notificationsCreated} notifikasi Finance Level 1 dibuat.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
