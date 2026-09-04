/**
 * File: backend-express/scripts/seed_operational_master.ts
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
 * Database operations: Reads or mutates Prisma model(s) `core_tenant`, `core_company`, `core_organization`.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  console.log('=== SEEDING PT SINERGI MUDA ARSA OPERATIONAL MASTER DATA ===');

  const tenant = await prisma.core_tenant.findFirst({ where: { code: 'SINERGI_MUDA_ARSA' } });
  const company = await prisma.core_company.findFirst({ where: { company_code: 'SMA' } });

  if (!tenant || !company) {
    throw new Error('Tenant or Company PT Sinergi Muda Arsa not found!');
  }

  // 1. Seed Operational Divisions / Work Units
  const orgUnits = [
    {
      code: 'ORG-SMA-HQ',
      name: 'Kantor Pusat PT Sinergi Muda Arsa',
      type: 'HEADQUARTER',
      status: 'ACTIVE',
    },
    {
      code: 'ORG-SMA-RESEARCH',
      name: 'Divisi Riset, Studi Kelayakan & Kebijakan Publik',
      type: 'DIVISION',
      status: 'ACTIVE',
    },
    {
      code: 'ORG-SMA-MEDIA',
      name: 'Divisi Produksi Konten Kreatif & Media Digital',
      type: 'DIVISION',
      status: 'ACTIVE',
    },
    {
      code: 'ORG-SMA-CONSULT',
      name: 'Divisi Konsultansi & Edukasi Perubahan Perilaku',
      type: 'DIVISION',
      status: 'ACTIVE',
    },
    {
      code: 'ORG-SMA-FIELD',
      name: 'Divisi Rekayasa Teknis & Lapangan (Field Ops)',
      type: 'DIVISION',
      status: 'ACTIVE',
    },
  ];

  for (const org of orgUnits) {
    const existing = await prisma.core_organization.findFirst({
      where: { organization_code: org.code },
    });

    if (!existing) {
      await prisma.core_organization.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          company_id: company.id,
          organization_code: org.code,
          organization_name: org.name,
          organization_type: org.type,
          status: org.status,
        },
      });
      console.log(`Created Organization Unit: [${org.code}] ${org.name}`);
    } else {
      await prisma.core_organization.update({
        where: { id: existing.id },
        data: {
          tenant_id: tenant.id,
          company_id: company.id,
          organization_name: org.name,
          organization_type: org.type,
          status: org.status,
        },
      });
      console.log(`Updated Organization Unit: [${org.code}] ${org.name}`);
    }
  }

  // 2. Seed Operational Equipment & Work Assets
  const assetsData = [
    {
      code: 'AST-SMA-001',
      name: 'Kit Kamera Cinema Sony FX3 4K + Lensa GM 24-70mm',
      serial: 'SN-SNY-FX3-881920',
      cost: 65000000,
      status: 'ACTIVE_IN_USE',
    },
    {
      code: 'AST-SMA-002',
      name: 'Wireless Audio Kit DJI Mic 2 + Boom Pole Kit',
      serial: 'SN-DJI-MIC2-102948',
      cost: 8500000,
      status: 'AVAILABLE_IN_STUDIO',
    },
    {
      code: 'AST-SMA-003',
      name: 'Drone DJI Air 3 4K Fly More Kit (Survey & Aerial)',
      serial: 'SN-DJI-AIR3-559102',
      cost: 24500000,
      status: 'AVAILABLE_IN_STUDIO',
    },
    {
      code: 'AST-SMA-004',
      name: 'Apple MacBook Pro M3 Max 64GB (Video & Design Workstation)',
      serial: 'SN-APL-MBP-992018',
      cost: 54000000,
      status: 'ACTIVE_IN_USE',
    },
    {
      code: 'AST-SMA-005',
      name: 'NAS Storage Server Synology DS923+ 32TB Project Archive',
      serial: 'SN-SYN-NAS-339102',
      cost: 22000000,
      status: 'ONLINE_HQ',
    },
  ];

  for (const ast of assetsData) {
    const existing = await prisma.asset_asset.findFirst({
      where: { asset_code: ast.code },
    });

    if (!existing) {
      await prisma.asset_asset.create({
        data: {
          id: crypto.randomUUID(),
          company_id: company.id,
          asset_code: ast.code,
          asset_name: ast.name,
          serial_number: ast.serial,
          acquisition_cost: ast.cost,
          acquisition_date: new Date('2026-01-10'),
          status: ast.status,
        },
      });
      console.log(`Created Work Asset: [${ast.code}] ${ast.name}`);
    } else {
      await prisma.asset_asset.update({
        where: { id: existing.id },
        data: {
          company_id: company.id,
          asset_name: ast.name,
          serial_number: ast.serial,
          acquisition_cost: ast.cost,
          status: ast.status,
        },
      });
      console.log(`Updated Work Asset: [${ast.code}] ${ast.name}`);
    }
  }

  console.log('=== OPERATIONAL MASTER DATA SEEDING COMPLETE! ===');
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
