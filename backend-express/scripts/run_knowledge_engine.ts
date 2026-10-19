import { RepositoryCrawler } from '../src/modules/marbot/knowledge-engine/crawler/repository-crawler';
import { ScanCoordinatorService } from '../src/modules/marbot/knowledge-engine/manager/scan-coordinator.service';
import { WorkerRegistry } from '../src/modules/marbot/knowledge-engine/queue/worker-registry';
import prisma from '../src/config/database';

async function main() {
  const args = process.argv.slice(2);
  const isWorker = args.includes('--worker');
  const stageArg = args.find((a) => a.startsWith('--stage='));
  const stage = stageArg ? stageArg.split('=')[1] : null;

  console.log('🤖 Arsalynt ERP - Marka Plus Knowledge Engine (MKIE)');

  if (isWorker) {
    console.log('🚀 Starting Knowledge Engine Worker...');
    let running = true;

    const stop = () => {
      console.log('\n🛑 Stopping worker...');
      running = false;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    while (running) {
      try {
        const result = await WorkerRegistry.processBatch(`cli-worker-${process.pid}`, 5);
        if (result.claimed > 0) {
          console.log(
            `📦 Batch processed: ${result.claimed} claimed, ${result.completed} completed, ${result.failed} failed.`
          );
        }
      } catch (err) {
        console.error('Worker batch execution error:', err);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    await prisma.$disconnect();
    process.exit(0);
  }

  if (stage === 'crawl') {
    console.log('🔍 Executing Stage: CRAWL...');
    const result = await RepositoryCrawler.crawl({ persistToDb: false });
    console.log(`✅ Crawl completed!`);
    console.log(`- Commit SHA: ${result.commitSha}`);
    console.log(`- Total Evidences: ${result.totalEvidences}`);
    console.log(`- Active Modules: ${result.runtimeFacts.activeModules.length}`);
    await prisma.$disconnect();
    process.exit(0);
  }

  if (stage === 'analyze' || stage === 'verify' || stage === 'publish') {
    console.log(`⚙️ Executing Stage: ${stage.toUpperCase()}...`);
    const modeOverride = stage === 'publish' ? 'auto_tier1' : 'observation';
    const result = await ScanCoordinatorService.runScan({
      modeOverride,
    });

    console.log(`✅ Scan finished!`);
    console.log(`- Commit: ${result.commitSha}`);
    console.log(`- Evidences: ${result.totalEvidences}`);
    console.log(`- Entries: ${result.totalEntries}`);
    console.log(`- Snapshot ID: ${result.publishResult.snapshotId}`);
    console.log(`- Status: ${result.publishResult.status}`);
    console.log(`- Active Entries: ${result.publishResult.activeEntriesCount}`);
    console.log(`- Quarantined: ${result.publishResult.quarantinedCount}`);
    console.log(`- Issues Found: ${result.publishResult.issuesCount}`);
    console.log(`- Regression Passed: ${result.publishResult.regressionPassed}`);

    await prisma.$disconnect();
    process.exit(0);
  }

  // Default: Show usage
  console.log(`
Usage:
  ts-node scripts/run_knowledge_engine.ts --stage=crawl
  ts-node scripts/run_knowledge_engine.ts --stage=analyze
  ts-node scripts/run_knowledge_engine.ts --stage=verify
  ts-node scripts/run_knowledge_engine.ts --stage=publish
  ts-node scripts/run_knowledge_engine.ts --worker
  `);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Fatal CLI execution error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
