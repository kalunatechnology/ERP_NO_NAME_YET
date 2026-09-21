import { env } from '../../config/env';
import { AppError, ValidationError } from '../../utils/errors';
import { ChatbotProvisionTenantRequest, ChatbotProvisionTenantResponse } from './marbot.types';

export class MarbotControlPlaneClient {
  private readonly baseUrl: string;
  private readonly controlPlaneSecret: string;

  constructor(baseUrl?: string, controlPlaneSecret?: string) {
    this.baseUrl = (baseUrl || env.CHATBOT_SERVICE_URL || '').replace(/\/+$/, '');
    this.controlPlaneSecret = controlPlaneSecret || env.CHATBOT_CONTROL_PLANE_SECRET || '';
  }

  /**
   * Asserts that the control plane configuration is present and valid before attempting outbound calls.
   */
  public assertConfigured(): void {
    if (!this.baseUrl) {
      throw new ValidationError(
        'CHATBOT_SERVICE_URL belum dikonfigurasi pada environment server ERP.',
      );
    }
    if (!this.controlPlaneSecret) {
      throw new ValidationError(
        'CHATBOT_CONTROL_PLANE_SECRET belum dikonfigurasi pada environment server ERP.',
      );
    }
  }

  /**
   * Calls the Chatbot admin API to provision a new tenant integration.
   * Authenticates via Authorization: Bearer <CHATBOT_CONTROL_PLANE_SECRET>.
   * Bounded by a 10-second timeout.
   */
  async provisionTenant(
    payload: ChatbotProvisionTenantRequest,
  ): Promise<ChatbotProvisionTenantResponse> {
    this.assertConfigured();

    const targetUrl = `${this.baseUrl}/api/v1/admin/tenants`;
    let response: globalThis.Response;

    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.controlPlaneSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (networkErr: any) {
      if (networkErr?.name === 'TimeoutError' || networkErr?.name === 'AbortError') {
        throw new AppError(
          'Permintaan provisioning ke layanan Chatbot timeout (batas 10 detik).',
          504,
          'CHATBOT_GATEWAY_TIMEOUT',
        );
      }
      throw new AppError(
        `Gagal terhubung ke layanan Chatbot: ${networkErr?.message || 'Network error'}`,
        502,
        'CHATBOT_NETWORK_ERROR',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        'Autentikasi control plane ke layanan Chatbot ditolak. Periksa CHATBOT_CONTROL_PLANE_SECRET.',
        502,
        'CHATBOT_CONTROL_PLANE_AUTH_FAILED',
      );
    }

    if (response.status === 409) {
      throw new AppError(
        `Tenant dengan externalTenantId '${payload.externalTenantId}' sudah terdaftar pada layanan Chatbot.`,
        409,
        'CHATBOT_TENANT_ALREADY_EXISTS',
      );
    }

    let responseData: any = null;
    try {
      responseData = await response.json();
    } catch {
      // response wasn't JSON
    }

    if (!response.ok) {
      const errMsg =
        responseData?.message ||
        responseData?.error ||
        `Layanan Chatbot merespon status ${response.status} (${response.statusText}).`;
      throw new AppError(errMsg, 502, 'CHATBOT_PROVISIONING_FAILED');
    }

    // Unwrap response data if wrapped in data property
    const rawData = responseData?.data ? responseData.data : responseData;

    if (
      !rawData?.apiKey?.key ||
      !rawData?.inboundContextSecret ||
      !rawData?.outboundToolSecret
    ) {
      throw new AppError(
        'Format respon provisioning dari layanan Chatbot tidak lengkap.',
        502,
        'CHATBOT_MALFORMED_RESPONSE',
      );
    }

    return {
      tenantId: rawData.tenantId || rawData.id,
      externalTenantId: rawData.externalTenantId,
      apiKey: {
        key: rawData.apiKey.key,
        keyId: rawData.apiKey.keyId || rawData.activeKeyId || 'default',
      },
      inboundContextSecret: rawData.inboundContextSecret,
      outboundToolSecret: rawData.outboundToolSecret,
      status: rawData.status || 'ACTIVE',
    };
  }
}

export const marbotControlPlaneClient = new MarbotControlPlaneClient();
