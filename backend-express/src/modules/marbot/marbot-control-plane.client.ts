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

  private async request(path: string, init: RequestInit): Promise<any> {
    this.assertConfigured();
    let response: globalThis.Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.controlPlaneSecret}`,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
        signal: init.signal || AbortSignal.timeout(15000),
      });
    } catch (networkErr: any) {
      if (networkErr?.name === 'TimeoutError' || networkErr?.name === 'AbortError') {
        throw new AppError('Permintaan ke control plane Chatbot timeout.', 504, 'CHATBOT_GATEWAY_TIMEOUT');
      }
      throw new AppError(
        `Gagal terhubung ke control plane Chatbot: ${networkErr?.message || 'Network error'}`,
        502,
        'CHATBOT_NETWORK_ERROR',
      );
    }

    let payload: any = null;
    try { payload = await response.json(); } catch { /* non-JSON upstream */ }
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        'Autentikasi control plane ke layanan Chatbot ditolak. Periksa CHATBOT_CONTROL_PLANE_SECRET.',
        502,
        'CHATBOT_CONTROL_PLANE_AUTH_FAILED',
      );
    }
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || payload?.error
        || `Control plane Chatbot merespon ${response.status}.`;
      throw new AppError(message, response.status === 404 ? 404 : 502, 'CHATBOT_CONTROL_PLANE_REQUEST_FAILED');
    }
    return payload?.data ?? payload;
  }

  /**
   * Calls the Chatbot admin API to provision a new tenant integration.
   * Authenticates via Authorization: Bearer <CHATBOT_CONTROL_PLANE_SECRET>.
   * Bounded by a 10-second timeout.
   */
  async provisionTenant(
    payload: ChatbotProvisionTenantRequest,
    idempotencyKey: string,
  ): Promise<ChatbotProvisionTenantResponse> {
    this.assertConfigured();

    const targetUrl = `${this.baseUrl}/api/v1/control-plane/tenants`;
    let response: globalThis.Response;

    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.controlPlaneSecret}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
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

    const rawData = responseData?.data ? responseData.data : responseData;

    if (
      rawData?.contractVersion !== 2 ||
      !rawData?.tenant?.id ||
      rawData?.tenant?.externalTenantId !== payload.externalTenantId ||
      !rawData?.credentials?.apiKey ||
      !rawData?.credentials?.keyId ||
      !rawData?.credentials?.inboundContextSecret ||
      !rawData?.credentials?.outboundToolSecret
    ) {
      throw new AppError(
        'Format respon provisioning dari layanan Chatbot tidak lengkap.',
        502,
        'CHATBOT_MALFORMED_RESPONSE',
      );
    }

    return rawData as ChatbotProvisionTenantResponse;
  }

  /**
   * Upgrades an already-existing chatbot tenant to the managed ERP V2 contract.
   * Raw tenant credentials cannot be read back, so this deliberately rotates
   * them after module and datasource synchronization succeeds.
   */
  async adoptExistingTenant(
    payload: ChatbotProvisionTenantRequest,
  ): Promise<ChatbotProvisionTenantResponse> {
    const externalId = encodeURIComponent(payload.externalTenantId);
    const tenant = await this.request(`/api/v1/control-plane/tenants/${externalId}`, { method: 'GET' });
    if (!tenant?.id || tenant.externalTenantId !== payload.externalTenantId) {
      throw new AppError('Tenant Chatbot yang akan diadopsi tidak cocok.', 502, 'CHATBOT_TENANT_MISMATCH');
    }
    const tenantPath = `/api/v1/control-plane/tenants/${encodeURIComponent(tenant.id)}`;

    await this.request(tenantPath, {
      method: 'PATCH',
      body: JSON.stringify({
        name: payload.name,
        erpBaseUrl: payload.erpBaseUrl,
        allowedErpDomains: payload.allowedErpDomains,
        allowedInternalCidrs: payload.allowedInternalCidrs,
      }),
    });
    await this.request(`${tenantPath}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    await this.request(`${tenantPath}/modules`, {
      method: 'PATCH',
      body: JSON.stringify({ modules: payload.modules }),
    });

    let dataSource: { id?: string; sourceKey?: string; status?: string } | null = null;
    if (payload.dataSource) {
      dataSource = await this.request(`${tenantPath}/data-sources`, {
        method: 'POST',
        body: JSON.stringify({ ...payload.dataSource, isPrimary: true, status: 'ACTIVE' }),
        signal: AbortSignal.timeout(30000),
      });
    }

    const signingKeys = await this.request(`${tenantPath}/rotate-keys`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const credential = await this.request(`${tenantPath}/rotate-credential`, {
      method: 'POST',
      body: JSON.stringify({ revokeOld: true, scopes: payload.credentialScopes }),
    });

    if (
      !credential?.newApiKey || !signingKeys?.keyId ||
      !signingKeys?.inboundContextKey || !signingKeys?.outboundToolKey
    ) {
      throw new AppError(
        'Control plane tidak mengembalikan credential V2 hasil rotasi secara lengkap.',
        502,
        'CHATBOT_MALFORMED_RESPONSE',
      );
    }

    return {
      contractVersion: 2,
      tenant: {
        id: tenant.id,
        externalTenantId: tenant.externalTenantId,
        status: 'ACTIVE',
      },
      credentials: {
        apiKey: credential.newApiKey,
        keyId: signingKeys.keyId,
        inboundContextSecret: signingKeys.inboundContextKey,
        outboundToolSecret: signingKeys.outboundToolKey,
      },
      dataSource,
    };
  }
}

export const marbotControlPlaneClient = new MarbotControlPlaneClient();
