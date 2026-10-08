import { ValidationError } from '../../utils/errors';

/** Validates receipt business data without allowing clients to set workflow state. */
export function validateCustomerReceipt(data: Record<string, any>) {
  const allocation = data.allocation_plan && typeof data.allocation_plan === 'object' && !Array.isArray(data.allocation_plan)
    ? data.allocation_plan : {};
  const errors: Record<string, string> = {};
  const customerName = String(allocation.customer_name ?? '').trim();
  const projectName = String(allocation.project_name ?? '').trim();
  const bankAccountId = String(data.bank_account_id ?? '').trim();
  const reference = String(data.reference_number ?? '').trim();
  const dateKey = String(data.payment_date ?? '');
  const date = new Date(dateKey);
  const amount = Number(data.amount);
  if (!customerName) errors.customer_name = 'Nama klien / perusahaan wajib diisi.';
  if (!projectName) errors.project_name = 'Nama proyek terkait wajib diisi.';
  if (!Number.isFinite(amount) || amount < 1000) errors.amount = 'Nominal uang masuk wajib diisi, minimal Rp 1.000.';
  if (!bankAccountId) errors.bank_account = 'Pilih rekening kas / bank penerima dana.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    errors.payment_date = 'Tanggal terima dana wajib diisi dengan tanggal yang valid.';
  }
  if (!reference) errors.reference_number = 'No. bukti transfer / resi bank klien wajib diisi.';
  if (!['BANK_TRANSFER', 'GIRO_CEK', 'CASH'].includes(data.payment_method)) errors.payment_method = 'Pilih metode penerimaan yang valid.';
  if (Object.keys(errors).length) throw new ValidationError('Lengkapi data penerimaan pelanggan yang wajib diisi.', errors);
  return {
    ...data,
    payment_type: 'CUSTOMER_RECEIPT',
    status: 'DRAFT',
    bank_account_id: bankAccountId,
    reference_number: reference,
    payment_date: date,
    amount,
    allocation_plan: { ...allocation, customer_name: customerName, project_name: projectName },
  };
}
