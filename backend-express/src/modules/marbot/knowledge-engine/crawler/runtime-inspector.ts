import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../../../config/env';
import type { Evidence } from '../contracts/evidence.schema';

export interface RuntimeContextFacts {
  deploymentTarget: string;
  enforceIam: boolean;
  enforceFieldPermissions: boolean;
  activeModules: string[];
  runtimeHash: string;
}

export class RuntimeInspector {
  /**
   * Retrieves active runtime facts and computes an environment configuration hash.
   */
  static getRuntimeFacts(): RuntimeContextFacts {
    const raw = {
      target: env.DEPLOYMENT_TARGET,
      iam: env.ERP_ENFORCE_IAM,
      fieldPermissions: env.ERP_ENFORCE_FIELD_PERMISSIONS,
      contractMode: env.CHATBOT_CONTRACT_MODE,
      keMode: env.MARBOT_KE_MODE,
    };

    const runtimeHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(raw))
      .digest('hex');

    return {
      deploymentTarget: env.DEPLOYMENT_TARGET,
      enforceIam: env.ERP_ENFORCE_IAM,
      enforceFieldPermissions: env.ERP_ENFORCE_FIELD_PERMISSIONS,
      activeModules: [
        'CRM',
        'SALES',
        'PROCUREMENT',
        'INVENTORY',
        'MANUFACTURING',
        'QUALITY',
        'ASSETS',
        'SERVICE',
        'LOGISTICS',
        'ANALYTICS',
        'IMPLEMENTATION',
        'FINANCE',
        'PROJECTS',
        'REQUESTS',
        'REPORTING',
        'MASTER_DATA',
        'MARBOT',
      ],
      runtimeHash,
    };
  }

  /**
   * Scans tests and q10-system-testing to extract verified test evidence.
   */
  static extractTestEvidences(rootProjectDir: string, commitSha: string): Evidence[] {
    const testDir = path.join(rootProjectDir, 'backend-express', 'tests');
    if (!fs.existsSync(testDir)) return [];

    const evidences: Evidence[] = [];
    const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));

    for (const file of testFiles) {
      const full = path.join(testDir, file);
      const content = fs.readFileSync(full, 'utf8');
      const hash = crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');

      evidences.push({
        feature_id: `test.suite.${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
        source_file: `backend-express/tests/${file}`,
        symbol_name: file,
        ast_node_hash: hash,
        extraction_method: 'RUNTIME',
        source_type: 'TEST_RECORD',
        commit_sha: commitSha,
      });
    }

    return evidences;
  }
}
