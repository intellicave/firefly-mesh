/**
 * HubHttpClient — low-level HTTP transport for firefly-mesh hub API calls.
 *
 * Edge-runtime safe: built on the fetch() Web API (no node:http / axios).
 * All outgoing requests carry a Bearer JWT in the Authorization header.
 *
 * Error contract:
 *   - Non-2xx responses → throws AppError with code derived from response body
 *     (falls back to INTERNAL_ERROR when the body is not parseable).
 *   - Network failures (fetch rejects) propagate as-is.
 */

import { AppError, ErrorCode } from "@firefly-mesh/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubHttpClientOptions {
  /** Hub base URL, e.g. "https://mesh.acme.io" (no trailing slash). */
  baseUrl: string;
  /** JWT obtained after device pairing / activation. */
  jwt: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HubHttpClient {
  readonly baseUrl: string;
  private readonly jwt: string;

  constructor({ baseUrl, jwt }: HubHttpClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // strip trailing slash
    this.jwt = jwt;
  }

  // -------------------------------------------------------------------------
  // Public HTTP methods
  // -------------------------------------------------------------------------

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path, undefined);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path, undefined);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.jwt}`,
      Accept: "application/json",
    };

    let bodyInit: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyInit = JSON.stringify(body);
    }

    const response = await fetch(url, { method, headers, body: bodyInit });

    if (response.ok) {
      // 204 No Content — return undefined cast to T
      if (response.status === 204) {
        return undefined as T;
      }
      return response.json() as Promise<T>;
    }

    // Non-2xx: parse error body and throw AppError
    const errorCode = await parseErrorCode(response);
    const errorMessage = await parseErrorMessage(response, errorCode);
    throw new AppError(errorCode, errorMessage, response.status);
  }
}

// ---------------------------------------------------------------------------
// Error parsing helpers
// ---------------------------------------------------------------------------

async function parseErrorCode(response: Response): Promise<ErrorCode> {
  try {
    const cloned = response.clone();
    const json = (await cloned.json()) as Record<string, unknown>;
    const code = json["code"] as string | undefined;
    if (code !== undefined && code in ErrorCode) {
      return code as ErrorCode;
    }
  } catch {
    // non-JSON body — fall through to status-based mapping
  }
  return statusToErrorCode(response.status);
}

async function parseErrorMessage(
  response: Response,
  fallbackCode: ErrorCode,
): Promise<string> {
  try {
    const cloned = response.clone();
    const json = (await cloned.json()) as Record<string, unknown>;
    const message = json["message"] ?? json["error"];
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  } catch {
    // non-JSON body — fall through
  }
  return `Hub returned ${response.status} (${fallbackCode})`;
}

function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.FORBIDDEN;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.AGENT_NOT_FOUND;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
