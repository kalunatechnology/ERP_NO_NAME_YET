import type { Request } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { ForbiddenError, ValidationError } from '../../utils/errors';

/** Replay only a server-selected canonical ERP path through the complete app.
 * No dependency on a public hostname, proxy port, or a separate database client.
 * Only credentials and company context are carried over; authority is reloaded.
 */
export async function callMarbotErp(req: Request, path: string, method = 'GET', payload?: unknown, ticketId?: string): Promise<Response> {
  if (!req.headers.authorization || !req.companyId) throw new ForbiddenError();
  if (!/^\/api\/v1\/[a-z_-]+\//i.test(path) || /[\\\r\n#]|\/\.\.?\//.test(path) || path.startsWith('/api/v1/marbot/')) {
    throw new ValidationError('Path ERP internal tidak valid.');
  }
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const headers = { authorization: req.headers.authorization, 'x-company-id': req.companyId,
    'content-type': 'application/json', ...(ticketId ? { 'idempotency-key': `marbot-${ticketId}` } : {}) };
  const app = req.app as any;
  if (typeof app?.handle !== 'function') {
    // Compatibility for explicit HTTP clients and hermetic callers without an app.
    if (!req.socket?.localPort) throw new ValidationError('Koneksi API ERP tidak tersedia.');
    return fetch(`http://127.0.0.1:${req.socket.localPort}${path}`, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(30000), ...(body === undefined ? {} : { body }),
    });
  }
  return new Promise<Response>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) { callback(new Error('Respons ERP melebihi batas.')); return; }
      chunks.push(Buffer.from(chunk)); callback();
    } });
    const internal = new IncomingMessage(socket as any);
    internal.method = method;
    internal.url = path;
    internal.httpVersion = '1.1';
    internal.httpVersionMajor = 1;
    internal.httpVersionMinor = 1;
    // The complete body is queued below. Without this flag IncomingMessage's
    // auto-destroy closes its socket before asynchronous DB handlers respond.
    internal.complete = true;
    internal.headers = { ...headers, host: 'localhost', ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }) };
    const response = new ServerResponse(internal);
    response.useChunkedEncodingByDefault = false;
    response.shouldKeepAlive = false;
    response.assignSocket(socket as any);
    const timer = setTimeout(() => { reject(new Error('API ERP internal timeout; hasil belum terverifikasi.')); response.destroy(); }, 30000);
    socket.on('error', error => { clearTimeout(timer); reject(error); });
    response.on('error', error => { clearTimeout(timer); reject(error); });
    response.on('finish', () => {
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks);
        const boundary = raw.indexOf('\r\n\r\n');
        if (boundary < 0) throw new Error('Respons ERP internal tidak valid.');
        const responseHeaders = new Headers();
        for (const line of raw.subarray(0, boundary).toString().split('\r\n').slice(1)) {
          const separator = line.indexOf(':');
          if (separator > 0) responseHeaders.append(line.slice(0, separator), line.slice(separator + 1).trim());
        }
        resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : raw.subarray(boundary + 4), { status: response.statusCode, headers: responseHeaders }));
      } catch (error) { reject(error); }
      finally { socket.destroy(); }
    });
    if (body !== undefined) internal.push(Buffer.from(body));
    internal.push(null);
    app.handle(internal, response);
  });
}
