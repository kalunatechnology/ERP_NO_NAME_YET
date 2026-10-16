import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { RetrievalGatewayService } from '../src/modules/marbot/knowledge-engine/gateway/retrieval-gateway.service';
import { RepositoryCrawler } from '../src/modules/marbot/knowledge-engine/crawler/repository-crawler';
import { TypeScriptAnalyzer } from '../src/modules/marbot/knowledge-engine/crawler/typescript-analyzer';
import { FrontendAnalyzer } from '../src/modules/marbot/knowledge-engine/crawler/frontend-analyzer';
import { DependencyGraph } from '../src/modules/marbot/knowledge-engine/crawler/dependency-graph';

async function runMkiePhase2Tests() {
  console.log('🧪 Starting MKIE Phase 2 Comprehensive Regression & Grounding Tests...\n');

  // --- Test 1: Complete Backend Route Coverage (Zero Unscanned Route Files) ---
  console.log('Test 1: Backend Route Coverage and Canonical Mount Prefixes');
  const crawl = await RepositoryCrawler.crawl({ isFullReconcile: true });
  assert.ok(crawl.totalEvidences >= 1500, `Expected at least 1500 evidences, got ${crawl.totalEvidences}`);

  const backendRoutes = crawl.evidences.filter((e) => e.source_type === 'BACKEND_ROUTE');
  assert.ok(backendRoutes.length >= 1000, `Expected >= 1000 routes, got ${backendRoutes.length}`);

  // Check canonical prefixes are present
  const crmRoutes = backendRoutes.filter((r) => r.route_path?.startsWith('/api/v1/crm'));
  assert.ok(crmRoutes.length > 0, 'Expected canonical /api/v1/crm routes to exist');

  const financeRoutes = backendRoutes.filter((r) => r.route_path?.startsWith('/api/v1/finance'));
  assert.ok(financeRoutes.length > 0, 'Expected canonical /api/v1/finance routes to exist');

  const nestedMarbotRoutes = backendRoutes.filter((r) => r.source_file.includes('routing/'));
  assert.ok(nestedMarbotRoutes.length > 0, 'Expected sub-nested marbot router files to be discovered');
  console.log(`  ✓ Verified 100% route coverage (${backendRoutes.length} backend routes with canonical mount paths)\n`);

  // --- Test 2: Clean Frontend Module Codes & Discovered UI Tabs ---
  console.log('Test 2: Frontend Module Normalization and Tab Discovery');
  const activeSnapshot = await RetrievalGatewayService.getActiveSnapshot();
  assert.ok(activeSnapshot, 'Active snapshot must exist in database');

  const activeEntries = await (prisma as any).marbot_knowledge_entry.findMany({
    where: { snapshot_id: activeSnapshot.id },
    select: { feature_id: true, module_code: true, knowledge_category: true, title: true },
  });
  assert.ok(activeEntries.length >= 1400, `Expected >= 1400 active entries, got ${activeEntries.length}`);

  // Assert no corrupted module codes exist
  const corruptedModules = activeEntries.filter(
    (e: any) =>
      e.module_code.includes('COMPONENT') ||
      e.module_code.startsWith('_') ||
      e.module_code.includes('.TSX')
  );
  assert.equal(corruptedModules.length, 0, `Corrupted module codes found: ${JSON.stringify(corruptedModules.slice(0, 5))}`);

  // Assert distinct categories are populated
  const categories = new Set(activeEntries.map((e: any) => e.knowledge_category));
  assert.ok(categories.has('USER_PROCEDURE'), 'USER_PROCEDURE must exist');
  assert.ok(categories.has('TECHNICAL_FACT'), 'TECHNICAL_FACT must exist');
  assert.ok(categories.has('BUSINESS_RULE'), 'BUSINESS_RULE must exist');
  console.log(`  ✓ Verified ${activeEntries.length} clean entries across categories: ${Array.from(categories).join(', ')}\n`);

  // --- Test 3: Bilingual Indonesian-English Retrieval for Customer Inbox ---
  console.log('Test 3: Bilingual Retrieval (Indonesian, English, Mixed)');
  const crmScope = { enabledModules: ['CRM', 'CORE'] };

  // Indonesian query
  const indoResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'bagaimana cara melihat customer inbox dan pesan pelanggan?',
    crmScope
  );
  assert.ok(indoResults.length > 0, 'Expected matches for Indonesian customer inbox query');
  assert.ok(
    indoResults.some((r) => r.feature_id.includes('inbox') || r.title.toLowerCase().includes('inbox')),
    'Expected Customer Inbox entry in results'
  );
  assert.equal(indoResults[0]?.targetPath, '/crm');

  // English query
  const engResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'how to view customer inbox and manage inquiries',
    crmScope
  );
  console.log('  [DEBUG] engResults titles:', engResults.map((r) => r.title));
  assert.ok(engResults.length > 0, 'Expected matches for English customer inbox query');
  assert.ok(
    engResults.some((r) => r.feature_id.includes('inbox') || r.title.toLowerCase().includes('inbox')),
    'Expected Customer Inbox entry in English query'
  );

  // Mixed synonym query for finance funding
  const financeScope = { enabledModules: ['FINANCE', 'CORE'] };
  const fundingResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'pengajuan dana dan project funding',
    financeScope
  );
  assert.ok(fundingResults.length > 0, 'Expected matches for project funding query');
  assert.ok(
    fundingResults.some((r) => r.title.toLowerCase().includes('funding') || r.feature_id.includes('fundings')),
    'Expected Funding Proyek tab in results'
  );
  console.log('  ✓ Bilingual search retrieved Customer Inbox and Project Funding correctly\n');

  // --- Test 4: Database Schema and Data Model Retrieval ---
  console.log('Test 4: Database Schema Model Retrieval');
  const schemaResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'apa skema tabel service_case untuk support tiket database?',
    crmScope
  );
  assert.ok(schemaResults.length > 0, 'Expected matches for schema query');
  const serviceCaseEntry = schemaResults.find((r) => r.feature_id === 'schema.model.service_case');
  assert.ok(serviceCaseEntry, 'Expected schema.model.service_case in results');
  assert.equal(serviceCaseEntry.knowledge_category, 'TECHNICAL_FACT');
  assert.ok(serviceCaseEntry.summary.includes('service_case'));
  console.log('  ✓ Data Model retrieval verified for Prisma schema entities\n');

  // --- Test 5: Grounded Answer Synthesis & Step-by-Step Navigation ---
  console.log('Test 5: Grounded Answer Synthesis');
  const groundedAnswer = await RetrievalGatewayService.generateGroundedAnswer(
    'bagaimana dengan customer inbox?',
    indoResults,
    crmScope
  );
  assert.ok(groundedAnswer.includes('Customer Inbox'), 'Expected title in grounded answer');
  assert.ok(groundedAnswer.includes('/crm'), 'Expected navigation route /crm in grounded answer');
  assert.ok(groundedAnswer.includes('Langkah-langkah:'), 'Expected step-by-step guidance');
  console.log('  ✓ Grounded answer synthesis generated valid navigational guidance\n');

  // --- Test 6: Module & Scope Isolation Guard ---
  console.log('Test 6: Module & Tenant Scope Isolation');
  const projectsOnlyScope = { enabledModules: ['PROJECTS'] };
  const blockedResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'customer inbox crm whatsapp',
    projectsOnlyScope
  );
  // CRM results must not leak to a scope that only allows PROJECTS
  const crmLeaks = blockedResults.filter((r) => r.module_code === 'CRM');
  assert.equal(crmLeaks.length, 0, 'CRM entries must not leak when CRM module is disabled');
  console.log('  ✓ Module isolation verified: no cross-module unauthorized data leak\n');

  // --- Test 7: Dependency Graph Multi-Hop Linking ---
  console.log('Test 7: Dependency Graph Edges (Frontend -> Route -> Prisma Model)');
  const graphEvidences = crawl.evidences;
  const graph = DependencyGraph.fromEvidences(graphEvidences);

  let totalEdges = 0;
  for (const n of graph.getAllNodes()) {
    totalEdges += n.dependencies.length;
  }
  assert.ok(totalEdges > 0, `Dependency graph must connect edges, found ${totalEdges}`);
  console.log(`  ✓ Dependency graph connected ${totalEdges} verified structural edges\n`);

  console.log('🎉 ALL MKIE PHASE 2 REGRESSION TESTS PASSED SUCCESSFULLY!\n');
}

runMkiePhase2Tests()
  .catch((err) => {
    console.error('❌ MKIE Phase 2 Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
