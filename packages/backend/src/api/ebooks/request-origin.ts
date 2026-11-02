import type { Request } from 'express';

/**
 * Origem pública da requisição, usada para montar URLs que o navegador vai
 * consumir (capa, por exemplo). Respeita proxies que enviam
 * `x-forwarded-proto`/`x-forwarded-host`.
 */
export class RequestOrigin {
  static resolve(request: Request): string {
    const protocol = RequestOrigin.firstHeader(request, 'x-forwarded-proto')
      ?? request.protocol;
    const host =
      RequestOrigin.firstHeader(request, 'x-forwarded-host')
      ?? request.get('host');

    return `${protocol}://${host}`;
  }

  private static firstHeader(
    request: Request,
    name: string,
  ): string | null {
    const rawValue = request.headers[name];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value === undefined) return null;

    const first = value.split(',')[0]?.trim();
    return first && first.length > 0 ? first : null;
  }
}
