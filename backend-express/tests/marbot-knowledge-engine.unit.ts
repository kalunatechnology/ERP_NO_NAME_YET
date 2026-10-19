import assert from 'node:assert/strict';
import { SecretScrubber } from '../src/modules/marbot/knowledge-engine/crawler/secret-scrubber';
import { TypeScriptAnalyzer } from '../src/modules/marbot/knowledge-engine/crawler/typescript-analyzer';
import { PrismaAnalyzer } from '../src/modules/marbot/knowledge-engine/crawler/prisma-analyzer';
import { DependencyGraph } from '../src/modules/marbot/knowledge-engine/crawler/dependency-graph';
import { EvidenceValidator } from '../src/modules/marbot/knowledge-engine/verification/evidence-validator';
import { PolicyVerifier } from '../src/modules/marbot/knowledge-engine/verification/policy-verifier';
import { ConfidenceEvaluator } from '../src/modules/marbot/knowledge-engine/verification/confidence-evaluator';
import { RegressionChecker } from '../src/modules/marbot/knowledge-engine/verification/regression-checker';
import { LifecycleManager } from '../src/modules/marbot/knowledge-engine/publishing/lifecycle-manager';
import { CatalogBuilder } from '../src/modules/marbot/knowledge-engine/publishing/catalog-builder';
import { checkAbstention } from '../src/modules/marbot/knowledge-engine/gateway/abstention-guard';
import type { Evidence } from '../src/modules/marbot/knowledge-engine/contracts/evidence.schema';
import type { KnowledgeEntry } from '../src/modules/marbot/knowledge-engine/contracts/knowledge.schema';
import type { ProcedureRule } from '../src/modules/marbot/knowledge/schemas/procedure.schema';

async function runTests() {
  console.log('🧪 Starting Marbot Knowledge Engine (MKIE) Unit Tests...\n');

  // 1. Secret Scrubber Tests
  console.log('Test 1: Secret Scrubber filters forbidden files and redacts credentials');
  assert.equal(SecretScrubber.isForbiddenFile('.env'), true);
  assert.equal(SecretScrubber.isForbiddenFile('.env.production'), true);
  assert.equal(SecretScrubber.isForbiddenFile('cert.pem'), true);
  assert.equal(SecretScrubber.isForbiddenFile('src/modules/finance/finance.routes.ts'), false);

  const dirtyText = 'API_KEY="AIzaSyA1234567890abcdefghijklmnopqrstuvw" and password="super_secret_password_123"';
  const scrubbed = SecretScrubber.scrubText(dirtyText);
  assert.ok(!scrubbed.includes('AIzaSyA1234567890abcdefghijklmnopqrstuvw'));
  assert.ok(scrubbed.includes('[REDACTED_SECRET]'));
  console.log('  ✓ Secret Scrubber passed\n');

  // 2. TypeScript Analyzer Node Hashing
  console.log('Test 2: TypeScript Analyzer SHA-256 node hashing');
  const hash1 = TypeScriptAnalyzer.hashNode('router.get("/test", handler);');
  const hash2 = TypeScriptAnalyzer.hashNode('router.get("/test", handler);');
  const hash3 = TypeScriptAnalyzer.hashNode('router.post("/test", handler);');
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  console.log('  ✓ TypeScript Analyzer hashing passed\n');

  // 3. Prisma Analyzer DMMF extraction
  console.log('Test 3: Prisma DMMF model fact extraction');
  const prismaEvidences = PrismaAnalyzer.extractPrismaEvidences('test-commit-sha');
  assert.ok(prismaEvidences.length > 0);
  assert.ok(prismaEvidences.some((ev) => ev.symbol_name === 'marbot_knowledge_entry'));
  console.log(`  ✓ Extracted ${prismaEvidences.length} Prisma model facts\n`);

  // 4. Dependency Graph Linking
  console.log('Test 4: Dependency Graph linking pages and routes');
  const sampleEvidences: Evidence[] = [
    {
      feature_id: 'finance.route.billing',
      source_file: 'src/modules/finance/finance.routes.ts',
      symbol_name: 'GET /finance/invoices',
      ast_node_hash: 'hash-route-1',
      route_method: 'GET',
      route_path: '/finance/invoices',
      extraction_method: 'AST',
      source_type: 'BACKEND_ROUTE',
      commit_sha: 'sha-1',
    },
    {
      feature_id: 'frontend.page.finance_invoices',
      source_file: 'frontend-next/app/finance/invoices/page.tsx',
      symbol_name: '/finance/invoices',
      ast_node_hash: 'hash-fe-1',
      route_path: '/finance/invoices',
      related_symbols: ['GET /finance/invoices'],
      extraction_method: 'TSX',
      source_type: 'FRONTEND_PAGE',
      commit_sha: 'sha-1',
    },
  ];
  const graph = DependencyGraph.fromEvidences(sampleEvidences);
  const routesForPage = graph.findRoutesForPage('frontend.page.finance_invoices');
  assert.equal(routesForPage.length, 1);
  assert.equal(routesForPage[0]?.feature_id, 'finance.route.billing');
  console.log('  ✓ Dependency Graph resolved page-to-route edge\n');

  // 5. Evidence Validator & Policy Verifier
  console.log('Test 5: Evidence Validator & Policy Verifier');
  const mockEntry: KnowledgeEntry = {
    feature_id: 'finance.route.billing',
    topic: 'finance',
    operation: 'invoice',
    module_code: 'FINANCE',
    title: 'Daftar Tagihan',
    knowledge_category: 'USER_PROCEDURE',
    lifecycle_status: 'ACTIVE',
    comparison_status: 'NEW',
    source_priority: 'CODE_FACT',
    actor_policy: {
      allowedRoles: ['FINANCE_OFFICER', 'FINANCE_MANAGER'],
      requiredModules: ['FINANCE'],
      requiresWriteAccess: false,
      uiVisibility: {
        allowedRoles: ['STAFF', 'FINANCE_OFFICER'], // Conflict: STAFF is not in allowedRoles
      },
      backendPolicy: {
        allowedRoles: ['FINANCE_OFFICER', 'FINANCE_MANAGER'],
      },
    },
    navigation: {
      targetPath: '/finance/invoices',
      apiEndpoint: 'GET /finance/invoices',
      requiredQueryParams: [],
    },
    content: {
      summary: 'Melihat daftar tagihan dan invoice keuangan.',
      steps: ['Buka menu Keuangan', 'Pilih Tagihan'],
      importantNotes: [],
    },
    confidence_score: 1.0,
    review_required: false,
    provenance: {
      commitSha: 'sha-1',
      astNodeHashes: ['hash-route-1'],
      sourceFiles: ['src/modules/finance/finance.routes.ts'],
      sourcePriority: 'CODE_FACT',
      sourceType: 'BACKEND_ROUTE',
    },
  };

  const validation = EvidenceValidator.validate(mockEntry, sampleEvidences);
  assert.equal(validation.isValid, true);
  assert.ok(validation.matchedEvidences.length >= 1);

  const policyVerification = PolicyVerifier.verify(mockEntry.actor_policy, sampleEvidences);
  assert.equal(policyVerification.isConsistent, false);
  assert.ok(policyVerification.conflicts.some((c) => c.includes('STAFF')));
  console.log('  ✓ Detected UI role discrepancy conflict correctly\n');

  // 6. Confidence Evaluator & Lifecycle Decisions
  console.log('Test 6: Confidence Evaluator and Lifecycle Promotion');
  const evaluation = ConfidenceEvaluator.evaluate(mockEntry, validation, policyVerification);
  assert.ok(evaluation.reviewRequired); // Policy conflict triggers review_required

  const decision = LifecycleManager.evaluateLifecycle(mockEntry, evaluation, 'CONFLICT');
  assert.equal(decision.lifecycleStatus, 'QUARANTINED');
  assert.equal(decision.promotionTier, 'TIER_3_MANUAL');
  console.log('  ✓ Policy conflict successfully routed to QUARANTINED (Tier 3)\n');

  // 7. Abstention Guard
  console.log('Test 7: Abstention Guard on QUARANTINED / RETIRED rules');
  const quarantinedRule: ProcedureRule = {
    id: 'test.quarantine',
    topic: 'invoice',
    operation: 'create',
    title: 'Buat Invoice Baru',
    lifecycleStatus: 'QUARANTINED',
    content: {
      summary: 'Draft instruksi pembuatan invoice',
    },
  };
  const abstentionResult = checkAbstention(quarantinedRule, 'invoice', 'create');
  assert.equal(abstentionResult.shouldAbstain, true);
  assert.equal(abstentionResult.reason, 'QUARANTINED');
  console.log('  ✓ Abstention Guard properly halted answer for quarantined rule\n');

  // 8. Regression Checker
  console.log('Test 8: Regression Checker');
  const regressionEmpty = RegressionChecker.check([]);
  assert.equal(regressionEmpty.passed, false);
  assert.ok(regressionEmpty.failures.length > 0);

  const regressionValid = RegressionChecker.check([mockEntry]);
  assert.equal(regressionValid.passed, true);
  console.log('  ✓ Regression Checker verified\n');

  // 9. Catalog Builder transformation
  console.log('Test 9: Catalog Builder procedure and module generation');
  const procedures = CatalogBuilder.buildProcedures([mockEntry]);
  assert.equal(procedures.length, 1);
  assert.equal(procedures[0]?.id, mockEntry.feature_id);
  assert.equal(procedures[0]?.authorization?.allowedRoles?.includes('FINANCE_OFFICER'), true);

  const modules = CatalogBuilder.buildModules([mockEntry]);
  assert.equal(modules.length, 1);
  assert.equal(modules[0]?.module, 'FINANCE');
  console.log('  ✓ Catalog Builder generated valid ProcedureRules and ModuleKnowledge\n');

  console.log('🎉 All Marbot Knowledge Engine unit tests PASSED successfully!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
