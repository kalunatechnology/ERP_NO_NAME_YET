import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/config/database';
import { Prisma } from '@prisma/client';
import { RepositoryCrawler } from '../src/modules/marbot/knowledge-engine/crawler/repository-crawler';
import { SnapshotManager } from '../src/modules/marbot/knowledge-engine/publishing/snapshot-manager';

async function runAudit() {
  console.log('=====================================================');
  console.log('🔍 MKIE COMPREHENSIVE INVENTORY & COVERAGE AUDIT');
  console.log('=====================================================\n');

  const cwd = process.cwd();
  const projectRootDir = cwd.endsWith('backend-express') ? path.resolve(cwd, '..') : cwd;
  const backendSrcDir = path.join(projectRootDir, 'backend-express', 'src');
  const backendModulesDir = path.join(backendSrcDir, 'modules');
  const frontendDir = path.join(projectRootDir, 'frontend-next');
  const prismaSchemaFile = path.join(projectRootDir, 'backend-express', 'prisma', 'schema.prisma');

  // --- 1. Backend Modules & Routes Inventory ---
  console.log('--- 1. BACKEND AUDIT ---');
  const moduleDirs = fs.readdirSync(backendModulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  console.log(`Discovered Backend Modules (${moduleDirs.length}):`, moduleDirs.join(', '));

  let totalBackendRouteFiles = 0;
  let totalBackendControllers = 0;
  let totalBackendServices = 0;
  const moduleRouteFileMap: Record<string, string[]> = {};

  for (const mod of moduleDirs) {
    const modPath = path.join(backendModulesDir, mod);
    const files = fs.readdirSync(modPath, { recursive: true })
      .filter((f): f is string => typeof f === 'string');

    const routeFiles = files.filter(f => f.endsWith('.routes.ts'));
    const controllerFiles = files.filter(f => f.endsWith('.controller.ts'));
    const serviceFiles = files.filter(f => f.endsWith('.service.ts'));

    moduleRouteFileMap[mod] = routeFiles;
    totalBackendRouteFiles += routeFiles.length;
    totalBackendControllers += controllerFiles.length;
    totalBackendServices += serviceFiles.length;
  }
  console.log(`Total Route files (.routes.ts): ${totalBackendRouteFiles}`);
  console.log(`Total Controller files: ${totalBackendControllers}`);
  console.log(`Total Service files: ${totalBackendServices}`);

  // Check subdirectories inside modules (e.g. sub-routes)
  const nestedRouteFiles: string[] = [];
  for (const mod of moduleDirs) {
    const routeFiles = moduleRouteFileMap[mod] || [];
    for (const rf of routeFiles) {
      if (rf.includes('/') || rf.includes('\\')) {
        nestedRouteFiles.push(`${mod}/${rf}`);
      }
    }
  }
  console.log(`Sub-nested route files (inside subdirs): ${nestedRouteFiles.length}`, nestedRouteFiles.slice(0, 5));

  // --- 2. Frontend Inventory ---
  console.log('\n--- 2. FRONTEND AUDIT ---');
  let totalTsxFiles = 0;
  let totalPageTsx = 0;
  let totalClientTsx = 0;
  let totalTabTsx = 0;
  let totalModalTsx = 0;
  let otherTsxFiles: string[] = [];

  const walkFrontend = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', '.next', 'dist', '.git'].includes(e.name)) {
          walkFrontend(full);
        }
      } else if (e.name.endsWith('.tsx')) {
        totalTsxFiles++;
        const rel = path.relative(frontendDir, full).replace(/\\/g, '/');
        if (e.name === 'page.tsx') totalPageTsx++;
        else if (e.name.endsWith('Client.tsx')) totalClientTsx++;
        else if (e.name.endsWith('Tabs.tsx')) totalTabTsx++;
        else if (e.name.endsWith('Modal.tsx')) totalModalTsx++;
        else otherTsxFiles.push(rel);
      }
    }
  };
  walkFrontend(frontendDir);
  console.log(`Total Frontend .tsx files: ${totalTsxFiles}`);
  console.log(`- page.tsx: ${totalPageTsx}`);
  console.log(`- *Client.tsx: ${totalClientTsx}`);
  console.log(`- *Tabs.tsx: ${totalTabTsx}`);
  console.log(`- *Modal.tsx: ${totalModalTsx}`);
  console.log(`- Other .tsx files: ${otherTsxFiles.length}`);

  // --- 3. Database Schema (Prisma DMMF) Inventory ---
  console.log('\n--- 3. DATABASE SCHEMA AUDIT ---');
  const dmmfModels = Prisma.dmmf.datamodel.models;
  const dmmfEnums = Prisma.dmmf.datamodel.enums;
  console.log(`Prisma Models in schema.prisma: ${dmmfModels.length}`);
  console.log(`Prisma Enums in schema.prisma: ${dmmfEnums.length}`);

  // Relations count
  let totalRelations = 0;
  for (const m of dmmfModels) {
    const relationFields = m.fields.filter(f => f.relationName);
    totalRelations += relationFields.length;
  }
  console.log(`Total Prisma relation fields: ${totalRelations}`);

  // --- 4. Crawler Execution & Comparison ---
  console.log('\n--- 4. CRAWLER SCAN AUDIT ---');
  const crawl = await RepositoryCrawler.crawl({ isFullReconcile: true });
  console.log(`Crawler extracted total evidences: ${crawl.totalEvidences}`);

  const bySourceType: Record<string, number> = {};
  for (const ev of crawl.evidences) {
    bySourceType[ev.source_type] = (bySourceType[ev.source_type] || 0) + 1;
  }
  console.log('Evidences by source_type:', bySourceType);

  // Check how many route files were actually analyzed vs total route files
  const scannedBackendFiles = new Set(
    crawl.evidences
      .filter(ev => ev.source_type === 'BACKEND_ROUTE')
      .map(ev => ev.source_file)
  );
  console.log(`Scanned Backend Route files count: ${scannedBackendFiles.size} / ${totalBackendRouteFiles}`);

  // Find unscanned backend route files
  const unscannedRouteFiles: string[] = [];
  for (const mod of moduleDirs) {
    const rfs = moduleRouteFileMap[mod] || [];
    for (const rf of rfs) {
      const expectedRel = `src/modules/${mod}/${rf}`.replace(/\\/g, '/');
      if (!scannedBackendFiles.has(expectedRel)) {
        unscannedRouteFiles.push(expectedRel);
      }
    }
  }
  console.log(`Unscanned backend route files (${unscannedRouteFiles.length}):`, unscannedRouteFiles.slice(0, 10));

  // Check frontend scanned files
  const scannedFrontendFiles = new Set(
    crawl.evidences
      .filter(ev => ev.source_type === 'FRONTEND_PAGE')
      .map(ev => ev.source_file)
  );
  console.log(`Scanned Frontend files: ${scannedFrontendFiles.size}`);

  // Tab evidences
  const tabEvidences = crawl.evidences.filter(ev => ev.feature_id.startsWith('frontend.tab.'));
  console.log(`Discovered frontend UI tabs: ${tabEvidences.length}`);

  // --- 5. Active DB Snapshot Audit ---
  console.log('\n--- 5. ACTIVE DB SNAPSHOT AUDIT ---');
  const activeSnapshot = await SnapshotManager.getActiveSnapshot();
  if (activeSnapshot) {
    console.log(`Active Snapshot ID: ${activeSnapshot.id}`);
    console.log(`Version Number: ${activeSnapshot.version_number}`);
    console.log(`Commit SHA: ${activeSnapshot.commit_sha}`);
    console.log(`Status: ${activeSnapshot.status}`);
    console.log(`Published At: ${activeSnapshot.published_at}`);

    const entriesCount = await (prisma as any).marbot_knowledge_entry.count({
      where: { snapshot_id: activeSnapshot.id },
    });
    console.log(`Active Snapshot total entries in DB: ${entriesCount}`);

    const entriesByModule = await (prisma as any).marbot_knowledge_entry.groupBy({
      by: ['module_code'],
      where: { snapshot_id: activeSnapshot.id },
      _count: { feature_id: true },
    });
    console.log('Entries by module_code in active snapshot:');
    for (const g of entriesByModule) {
      console.log(`  - ${g.module_code}: ${g._count.feature_id}`);
    }

    const entriesByCategory = await (prisma as any).marbot_knowledge_entry.groupBy({
      by: ['knowledge_category'],
      where: { snapshot_id: activeSnapshot.id },
      _count: { feature_id: true },
    });
    console.log('Entries by knowledge_category:');
    for (const g of entriesByCategory) {
      console.log(`  - ${g.knowledge_category}: ${g._count.feature_id}`);
    }

    // Check frontend tabs in DB
    const dbTabs = await (prisma as any).marbot_knowledge_entry.findMany({
      where: {
        snapshot_id: activeSnapshot.id,
        feature_id: { startsWith: 'frontend.tab.' },
      },
      select: { feature_id: true, title: true, module_code: true },
    });
    console.log(`Frontend UI tabs stored in active snapshot DB: ${dbTabs.length}`);
    for (const t of dbTabs) {
      console.log(`  - [${t.module_code}] ${t.title} (${t.feature_id})`);
    }
  } else {
    console.log('⚠️ No active snapshot found in DB.');
  }

  console.log('\n=====================================================');
  console.log('✅ AUDIT COMPLETE');
  console.log('=====================================================');
  await prisma.$disconnect();
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
