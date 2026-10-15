import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import type { Evidence } from '../contracts/evidence.schema';

export interface ModelFact {
  modelName: string;
  tableName: string;
  fields: Array<{
    name: string;
    type: string;
    isRequired: boolean;
    isId: boolean;
    isUnique: boolean;
    relationName?: string;
  }>;
  modelHash: string;
}

export class PrismaAnalyzer {
  /**
   * Extracts model definitions and schema facts from Prisma DMMF.
   */
  static extractModelFacts(): ModelFact[] {
    const models = Prisma.dmmf.datamodel.models;
    return models.map((m) => {
      const fieldList = m.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isRequired: f.isRequired,
        isId: f.isId,
        isUnique: f.isUnique,
        relationName: f.relationName,
      }));

      const representation = JSON.stringify({
        name: m.name,
        dbName: m.dbName || m.name,
        fields: fieldList,
      });

      const modelHash = crypto.createHash('sha256').update(representation).digest('hex');

      return {
        modelName: m.name,
        tableName: m.dbName || m.name,
        fields: fieldList,
        modelHash,
      };
    });
  }

  /**
   * Converts Prisma model facts to Evidence records.
   */
  static extractPrismaEvidences(commitSha: string): Evidence[] {
    const facts = this.extractModelFacts();
    return facts.map((fact) => ({
      feature_id: `schema.model.${fact.modelName.toLowerCase()}`,
      source_file: 'prisma/schema.prisma',
      symbol_name: fact.modelName,
      ast_node_hash: fact.modelHash,
      related_symbols: fact.fields.map((f) => f.name),
      extraction_method: 'DMMF',
      source_type: 'PRISMA_MODEL',
      commit_sha: commitSha,
    }));
  }
}
