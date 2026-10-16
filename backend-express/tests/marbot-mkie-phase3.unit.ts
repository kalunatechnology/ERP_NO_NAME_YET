import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import { RepositoryCrawler } from '../src/modules/marbot/knowledge-engine/crawler/repository-crawler';
import { DependencyGraph, SemanticEdge } from '../src/modules/marbot/knowledge-engine/crawler/dependency-graph';
import { RetrievalGatewayService } from '../src/modules/marbot/knowledge-engine/gateway/retrieval-gateway.service';
import { SnapshotManager } from '../src/modules/marbot/knowledge-engine/publishing/snapshot-manager';
import type { NativeScope } from '../src/modules/marbot/brain/reasoning/native.service';

const crmScope: NativeScope = {
  tenantId: 'tenant-test',
  companyId: 'company-test',
  userId: 'user-crm-lead',
  roleId: 'role-crm',
  roleCode: RoleCode.CRM_LEAD,
  enabledModules: ['CRM', 'MARBOT'],
  permissions: ['USE_MARBOT', 'VIEW_CRM'],
  projectScope: { mode: 'ALL', projectIds: [] },
};

const financeOnlyScope: NativeScope = {
  tenantId: 'tenant-test',
  companyId: 'company-test',
  userId: 'user-finance',
  roleId: 'role-fin',
  roleCode: RoleCode.FINANCE,
  enabledModules: ['FINANCE', 'MARBOT'],
  permissions: ['USE_MARBOT', 'VIEW_FINANCE'],
  projectScope: { mode: 'ALL', projectIds: [] },
};

async function runTests() {
  console.log('🧪 Starting MKIE Phase 3 Semantic Retrieval & Grounded Evaluation Tests...\n');

  // -------------------------------------------------------------
  // Test 1: Typed Semantic Dependency Graph & Provenance Tracing
  // -------------------------------------------------------------
  console.log('Test 1: Typed Semantic Dependency Graph & Provenance Tracing');
  const crawl = await RepositoryCrawler.crawl({ persistToDb: false });
  const graph = crawl.graph;
  const edges = graph.getAllSemanticEdges();

  assert(edges.length > 500, `Expected >500 semantic edges, got ${edges.length}`);

  const edgeTypes = new Set(edges.map((e) => e.edgeType));
  assert(edgeTypes.has('UI_CALLS_API'), 'Expected UI_CALLS_API edge type');
  assert(edgeTypes.has('SERVICE_ACCESSES_MODEL'), 'Expected SERVICE_ACCESSES_MODEL edge type');
  assert(edgeTypes.has('FEATURE_REQUIRES_PERMISSION'), 'Expected FEATURE_REQUIRES_PERMISSION edge type');

  // Trace full chain from Customer Inbox
  const inboxTrace = graph.traceFullChain('frontend.tab.crm.inbox');
  assert(inboxTrace !== null, 'Customer inbox full trace must not be null');
  assert(inboxTrace.apiRoutes.length > 0, 'Customer inbox must link to backend API routes');
  assert(inboxTrace.prismaModels.length > 0, 'Customer inbox must link to Prisma models (e.g. CustomerInquiry)');

  console.log(`  ✓ Verified ${edges.length} typed semantic edges (UI_CALLS_API, SERVICE_ACCESSES_MODEL, FEATURE_REQUIRES_PERMISSION)`);
  console.log(`  ✓ Verified end-to-end trace: Customer Inbox -> ${inboxTrace.apiRoutes.length} APIs -> ${inboxTrace.prismaModels.length} Models\n`);

  // -------------------------------------------------------------
  // Test 2: Dynamic Indonesian-English Concept Normalizer & Stemmer
  // -------------------------------------------------------------
  console.log('Test 2: Dynamic Indonesian-English Concept Normalizer & Stemmer');
  // 2a. Morphological stemming
  assert.equal(RetrievalGatewayService.stemIndonesian('melihat'), 'lihat');
  assert.equal(RetrievalGatewayService.stemIndonesian('pengelolaan'), 'kelola');
  assert.equal(RetrievalGatewayService.stemIndonesian('pembayaran'), 'bayar');
  assert.equal(RetrievalGatewayService.stemIndonesian('penagihan'), 'tagih');
  assert.equal(RetrievalGatewayService.stemIndonesian('persetujuan'), 'setuju');

  // 2b. Identifier tokenization
  const tokens1 = RetrievalGatewayService.tokenizeIdentifiers('CustomerInquiry');
  assert(tokens1.includes('customer') && tokens1.includes('inquiry'));
  const tokens2 = RetrievalGatewayService.tokenizeIdentifiers('project_funding_request');
  assert(tokens2.includes('project') && tokens2.includes('funding'));

  // 2c. Dynamic concept search (unseen words matching roots)
  const query1 = 'bagaimana melihat inbox pelanggan';
  const res1 = await RetrievalGatewayService.searchRelevantKnowledge(query1, crmScope);
  assert(res1.length > 0, 'Query 1 must return results');
  assert.match(res1[0].title, /Customer Inbox/i, 'First result must be Customer Inbox');

  const query2 = 'cara kualifikasi inquiry pelanggan yang masuk';
  const res2 = await RetrievalGatewayService.searchRelevantKnowledge(query2, crmScope);
  assert(res2.length > 0, 'Query 2 must find qualification route/inbox');
  const matchedQualify = res2.some((r) => r.feature_id.includes('qualify') || r.title.includes('Customer Inbox'));
  assert(matchedQualify, 'Must find customer inquiry qualification or inbox');

  console.log('  ✓ Verified Indonesian morphological stemmer & identifier tokenizer');
  console.log('  ✓ Dynamic concept retrieval successfully matched unscripted variations\n');

  // -------------------------------------------------------------
  // Test 3: Proving OpenRouter Grounding & Honest Abstention
  // -------------------------------------------------------------
  console.log('Test 3: Proving OpenRouter Grounding & Honest Abstention');
  const savedFetch = global.fetch;
  const savedKey = process.env.MARBOT_AI_API_KEY;
  const savedModel = process.env.MARBOT_AI_MODEL;

  let openRouterCalled = false;
  let receivedSystemPrompt = '';
  let receivedUserPrompt = '';

  try {
    process.env.MARBOT_AI_API_KEY = 'mock-key-123';
    process.env.MARBOT_AI_MODEL = 'anthropic/claude-3.5-sonnet';

    global.fetch = async (url: any, opts: any) => {
      if (String(url).includes('openrouter.ai')) {
        openRouterCalled = true;
        const body = JSON.parse(opts.body);
        receivedSystemPrompt = body.messages[0].content;
        receivedUserPrompt = body.messages[1].content;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    'Untuk membuka Customer Inbox di Arsalynt ERP, Anda dapat membuka menu CRM melalui [Buka Customer Inbox](/crm). Pada tab Customer Inbox, Anda dapat mengelola inquiry yang masuk sesuai hak akses CRM_LEAD.',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return savedFetch(url, opts);
    };

    const answer = await RetrievalGatewayService.generateGroundedAnswer(
      'bagaimana membuka customer inbox?',
      res1,
      crmScope
    );

    assert(openRouterCalled, 'OpenRouter must be called when API key and model are present');
    assert.match(receivedSystemPrompt, /ATURAN GROUNDING KETAT/);
    assert.match(receivedSystemPrompt, /Bila ada detail teknis atau formula khusus yang tidak disebutkan.*jujur/);
    assert.match(receivedUserPrompt, /Customer Inbox/);
    assert.match(answer, /Buka Customer Inbox/);
    assert.equal(RetrievalGatewayService.lastTelemetry?.usedProvider, 'openrouter');

    // 3b. Test honest abstention on empty evidence
    const emptyAnswer = await RetrievalGatewayService.generateGroundedAnswer(
      'fitur yang tidak pernah ada sama sekali',
      [],
      crmScope
    );
    assert.match(emptyAnswer, /tidak ditemukan dalam bukti kode/i);
    assert.equal(RetrievalGatewayService.lastTelemetry?.factsCount, 0);

    // 3c. Test graceful fallback on provider timeout/503
    global.fetch = async () => new Response('{}', { status: 503 });
    const fallbackAnswer = await RetrievalGatewayService.generateGroundedAnswer(
      'bagaimana membuka customer inbox?',
      res1,
      crmScope
    );
    assert.match(fallbackAnswer, /Customer Inbox/);
    assert.match(fallbackAnswer, /Sumber: Arsalynt ERP Code Knowledge Engine/);
    assert.equal(RetrievalGatewayService.lastTelemetry?.usedProvider, 'deterministic_fallback');

    console.log('  ✓ Proved OpenRouter LLM receives strict grounding prompt and live facts');
    console.log('  ✓ Proved honest abstention when evidence is empty');
    console.log('  ✓ Proved deterministic fallback resilience when provider fails (503)\n');
  } finally {
    global.fetch = savedFetch;
    process.env.MARBOT_AI_API_KEY = savedKey;
    process.env.MARBOT_AI_MODEL = savedModel;
  }

  // -------------------------------------------------------------
  // Test 4: Security Scope Isolation (Tenant & Module Boundaries)
  // -------------------------------------------------------------
  console.log('Test 4: Security Scope Isolation (Tenant & Module Boundaries)');
  // A Finance-only user searching for Customer Inbox should receive 0 matches
  const finSearchResults = await RetrievalGatewayService.searchRelevantKnowledge(
    'customer inbox inquiry',
    financeOnlyScope
  );
  const leakedCrm = finSearchResults.filter((r) => r.module_code === 'CRM');
  assert.equal(leakedCrm.length, 0, 'Finance user must NOT receive CRM knowledge entries');

  console.log('  ✓ Verified module isolation: unauthorized modules strictly filtered from knowledge store\n');

  // -------------------------------------------------------------
  // Test 5: Tri-Metric Quality Assessment
  // -------------------------------------------------------------
  console.log('Test 5: Tri-Metric Quality Assessment');
  const activeSnapshot = await SnapshotManager.getActiveSnapshot();
  assert(activeSnapshot !== null, 'Active snapshot must exist');

  const discoveryCoverage = {
    backendRoutes: crawl.evidences.filter((e) => e.source_type === 'BACKEND_ROUTE').length,
    prismaModels: crawl.evidences.filter((e) => e.source_type === 'PRISMA_MODEL').length,
    frontendTabsAndViews: crawl.evidences.filter(
      (e) => e.feature_id.startsWith('frontend.tab.') || e.feature_id.startsWith('frontend.view.')
    ).length,
  };

  const knowledgeCorrectness = {
    totalActiveEntries: activeSnapshot.entries?.length || 0,
    verifiedSemanticEdges: edges.filter((e) => e.verified).length,
  };

  assert(discoveryCoverage.backendRoutes >= 1160, 'Discovery coverage: routes >= 1160');
  assert(discoveryCoverage.prismaModels >= 280, 'Discovery coverage: models >= 280');
  assert(discoveryCoverage.frontendTabsAndViews >= 90, 'Discovery coverage: UI views/tabs >= 90');
  assert(knowledgeCorrectness.totalActiveEntries > 1000, 'Knowledge correctness: active entries > 1000');
  assert(knowledgeCorrectness.verifiedSemanticEdges > 500, 'Knowledge correctness: semantic edges > 500');

  console.log('  ✓ Discovery Coverage Metric:', JSON.stringify(discoveryCoverage));
  console.log('  ✓ Knowledge Correctness Metric:', JSON.stringify(knowledgeCorrectness));
  console.log('  ✓ Answer Grounding Metric: Verified strict grounding & honest abstention via OpenRouter prompt\n');

  console.log('🎉 ALL MKIE PHASE 3 EVALUATION & GROUNDING TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Phase 3 Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
