import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError, NotFoundError } from '../../utils/errors';

export async function completeInspection(id: string, companyId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const inspection = await tx.qa_inspection.findFirst({ where: { id, company_id: companyId } });
    if (!inspection) throw new NotFoundError('Inspection');
    if (inspection.status === 'COMPLETED') return inspection;
    if (!['DRAFT', 'IN_PROGRESS'].includes(inspection.status)) throw new ValidationError('Status inspection tidak dapat diselesaikan.');
    const inspected = inspection.quantity_inspected, accepted = inspection.quantity_accepted, rejected = inspection.quantity_rejected;
    if (inspected == null || accepted == null || rejected == null || inspected.lte(0) || accepted.lt(0) || rejected.lt(0) || !accepted.plus(rejected).equals(inspected)) throw new ValidationError('Jumlah diperiksa harus positif dan sama dengan diterima + ditolak.');
    const points = await tx.qa_quality_plan_point.findMany({ where: { company_id: companyId, quality_plan_id: inspection.quality_plan_id ?? '' } });
    const results = await tx.qa_inspection_result.findMany({ where: { company_id: companyId, inspection_id: id } });
    if (!inspection.quality_plan_id || !points.length || points.some(p => p.mandatory && results.filter(r => r.plan_point_id === p.id).length !== 1)) throw new ValidationError('Seluruh titik pemeriksaan wajib harus memiliki satu hasil.');
    if (results.some(r => !points.some(p => p.id === r.plan_point_id))) throw new ValidationError('Hasil inspection mengacu pada quality plan lain.');
    const failed = rejected.gt(0) || results.some(r => {
      const point = points.find(p => p.id === r.plan_point_id)!;
      return !r.passed || ((point.minimum_value != null || point.maximum_value != null) && (r.numeric_value == null || (point.minimum_value != null && r.numeric_value.lt(point.minimum_value)) || (point.maximum_value != null && r.numeric_value.gt(point.maximum_value))));
    });
    if (failed && !await tx.qa_nonconformance.findFirst({ where: { company_id: companyId, inspection_id: id } })) throw new ValidationError('Inspection gagal: catat NCR dan disposition sebelum menyelesaikan inspeksi.');
    if (inspection.goods_receipt_id) {
      const receipt = await tx.proc_goods_receipt.findFirst({ where: { id: inspection.goods_receipt_id, company_id: companyId } });
      if (!receipt) throw new ValidationError('Goods receipt inspection tidak valid.');
      const otherInspections = await tx.qa_inspection.findMany({ where: { company_id: companyId, goods_receipt_id: receipt.id, id: { not: id } } });
      const acceptedAll = !failed && otherInspections.every(i => i.status === 'COMPLETED' && i.result === 'PASS');
      await tx.proc_goods_receipt.update({ where: { id: receipt.id }, data: { inspection_status: acceptedAll ? 'ACCEPTED' : 'PENDING' } });
    }
    return tx.qa_inspection.update({ where: { id }, data: { status: 'COMPLETED', result: failed ? 'FAIL' : 'PASS', inspector_user_id: userId, inspection_at: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
