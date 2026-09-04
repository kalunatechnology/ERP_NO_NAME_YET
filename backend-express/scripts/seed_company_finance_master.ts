/**
 * File: backend-express/scripts/seed_company_finance_master.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Reads or mutates Prisma model(s) `core_company`, `fin_bank_account`.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  console.log('=== SEEDING PT SINERGI MUDA ARSA FINANCIAL & BANK MASTER DATA ===');

  const company = await prisma.core_company.findFirst({
    where: { company_code: 'SMA' },
  });

  if (!company) {
    throw new Error('PT Sinergi Muda Arsa not found in database!');
  }

  // 1. Update Company Profile Details
  await prisma.core_company.update({
    where: { id: company.id },
    data: {
      legal_name: 'PT Sinergi Muda Arsa',
      tax_number: '03.881.992.1-512.000',
      status: 'ACTIVE',
      fiscal_year_start: new Date('2026-01-01'),
    },
  });

  // 2. Seed Official Bank Accounts for PT Sinergi Muda Arsa
  const bankAccountsData = [
    {
      bank_name: 'Bank Central Asia (BCA) - KCP Pemuda Semarang',
      account_number: '882-019-2810',
      account_name: 'PT SINERGI MUDA ARSA',
      status: 'ACTIVE',
    },
    {
      bank_name: 'Bank Mandiri - KC Pahlawan Semarang',
      account_number: '136-00-2918201-9',
      account_name: 'PT SINERGI MUDA ARSA - OPERASIONAL PROYEK',
      status: 'ACTIVE',
    },
    {
      bank_name: 'Bank Negara Indonesia (BNI) - KC Semarang',
      account_number: '021-998-1029',
      account_name: 'PT SINERGI MUDA ARSA - PAYROLL & TAX',
      status: 'ACTIVE',
    },
  ];

  for (const ba of bankAccountsData) {
    const existing = await prisma.fin_bank_account.findFirst({
      where: { company_id: company.id, account_number: ba.account_number },
    });

    if (!existing) {
      await prisma.fin_bank_account.create({
        data: {
          id: crypto.randomUUID(),
          company_id: company.id,
          bank_name: ba.bank_name,
          account_number: ba.account_number,
          account_name: ba.account_name,
          status: ba.status,
        },
      });
      console.log(`Created Bank Account: ${ba.bank_name} [${ba.account_number}]`);
    } else {
      await prisma.fin_bank_account.update({
        where: { id: existing.id },
        data: {
          bank_name: ba.bank_name,
          account_name: ba.account_name,
          status: ba.status,
        },
      });
      console.log(`Updated Bank Account: ${ba.bank_name} [${ba.account_number}]`);
    }
  }

  // 3. Seed Official Credit Facilities (KMK & Bank Garansi)
  const creditFacilitiesData = [
    {
      facility_type: 'KREDIT_MODAL_KERJA_KMK',
      facility_number: 'KMK-MDR-2026-081',
      credit_limit: 750000000,
      utilized_amount: 150000000,
      available_amount: 600000000,
      effective_from: new Date('2026-01-15'),
      effective_to: new Date('2027-01-14'),
      status: 'ACTIVE',
    },
    {
      facility_type: 'BANK_GARANSI_PERFORMANCE_BOND',
      facility_number: 'BG-BCA-2026-119',
      credit_limit: 300000000,
      utilized_amount: 50000000,
      available_amount: 250000000,
      effective_from: new Date('2026-02-01'),
      effective_to: new Date('2026-12-31'),
      status: 'ACTIVE',
    },
  ];

  for (const cf of creditFacilitiesData) {
    const existing = await prisma.fin_credit_facility.findFirst({
      where: { company_id: company.id, facility_number: cf.facility_number },
    });

    if (!existing) {
      await prisma.fin_credit_facility.create({
        data: {
          id: crypto.randomUUID(),
          company_id: company.id,
          facility_type: cf.facility_type,
          facility_number: cf.facility_number,
          credit_limit: cf.credit_limit,
          utilized_amount: cf.utilized_amount,
          available_amount: cf.available_amount,
          effective_from: cf.effective_from,
          effective_to: cf.effective_to,
          status: cf.status,
        },
      });
      console.log(`Created Credit Facility: ${cf.facility_type} [${cf.facility_number}]`);
    } else {
      await prisma.fin_credit_facility.update({
        where: { id: existing.id },
        data: {
          credit_limit: cf.credit_limit,
          utilized_amount: cf.utilized_amount,
          available_amount: cf.available_amount,
          status: cf.status,
        },
      });
      console.log(`Updated Credit Facility: ${cf.facility_type} [${cf.facility_number}]`);
    }
  }

  console.log('=== SEEDING MASTER DATA COMPLETE! ===');
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
