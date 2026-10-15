import type { ProcedureRule } from '../../knowledge/schemas/procedure.schema';
import type { ProcedureOperation } from '../../brain/reasoning/intent';
import { formatUnavailable } from '../../knowledge/guidance-evaluator';

export type AbstentionReason =
  | 'RETIRED'
  | 'QUARANTINED'
  | 'CONFLICT'
  | 'UNVERIFIED'
  | 'MODULE_DISABLED';

export interface AbstentionResult {
  shouldAbstain: boolean;
  reason?: AbstentionReason;
  message?: string;
}

export function checkAbstention(
  rule: ProcedureRule,
  topicName: string,
  operation?: ProcedureOperation | string
): AbstentionResult {
  if (rule.lifecycleStatus === 'RETIRED') {
    return {
      shouldAbstain: true,
      reason: 'RETIRED',
      message: `Fitur ${rule.title} sudah tidak lagi digunakan atau telah dinonaktifkan pada versi sistem saat ini. Silakan periksa pembaharuan panduan atau hubungi administrator perusahaan.`,
    };
  }

  if (rule.lifecycleStatus === 'QUARANTINED' || rule.comparisonStatus === 'CONFLICT') {
    return {
      shouldAbstain: true,
      reason: 'QUARANTINED',
      message: `Panduan untuk ${operation ? operation : 'menggunakan'} ${topicName} sedang dalam proses verifikasi otorisasi sistem dan ditangguhkan sementara demi keamanan data. Belum ada data diubah.`,
    };
  }

  if (rule.comparisonStatus === 'UNVERIFIED') {
    return {
      shouldAbstain: true,
      reason: 'UNVERIFIED',
      message: formatUnavailable(topicName, operation),
    };
  }

  return { shouldAbstain: false };
}
