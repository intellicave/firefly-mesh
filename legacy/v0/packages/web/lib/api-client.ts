// Thin fetch wrapper with envelope unwrap + error normalization.
// Centralizes the { data, error } unwrap so route handlers don't repeat.

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiCallError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

interface CallOpts<TBody> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TBody;
  signal?: AbortSignal;
}

export async function api<TResp, TBody = unknown>(
  path: string,
  opts: CallOpts<TBody> = {},
): Promise<TResp> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  };

  const res = await fetch(path, init);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (json as { error?: ApiError }).error ?? {
      code: "INTERNAL_ERROR",
      message: `HTTP ${res.status}`,
    };
    throw new ApiCallError(res.status, err);
  }

  return (json as { data: TResp }).data;
}
