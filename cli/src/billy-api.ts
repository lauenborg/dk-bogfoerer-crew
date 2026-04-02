/**
 * Minimal Billy API klient til CLI-brug
 */

const BASE_URL = "https://api.billysbilling.com/v2";

let overrideToken: string | undefined;

export function setToken(token: string): void {
  overrideToken = token;
  process.env.BILLY_API_TOKEN = token;
}

export function getToken(): string {
  const token = overrideToken ?? process.env.BILLY_API_TOKEN;
  if (!token) {
    throw new Error(
      "BILLY_API_TOKEN er ikke sat.\n" +
      "Find dit token: Billy → Indstillinger → Adgangstokens\n" +
      "Kør 'dk-bogfoerer setup' for at konfigurere.",
    );
  }
  return token;
}

export async function billyFetch(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<unknown> {
  const { method = "GET", body, params } = options;
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    "X-Access-Token": getToken(),
    "Accept": "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Billy API ${response.status}: ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

export async function getOrganization(): Promise<Record<string, unknown>> {
  const result = await billyFetch("/organization") as Record<string, unknown>;
  return (result.organization ?? result) as Record<string, unknown>;
}

export async function getDaybooks(): Promise<Array<Record<string, unknown>>> {
  const result = await billyFetch("/daybooks") as Record<string, unknown>;
  return (result.daybooks ?? []) as Array<Record<string, unknown>>;
}

export async function getAccounts(): Promise<Array<Record<string, unknown>>> {
  const result = await billyFetch("/accounts", { params: { pageSize: 500 } }) as Record<string, unknown>;
  return (result.accounts ?? []) as Array<Record<string, unknown>>;
}

export async function uploadFile(filename: string, dataBase64: string): Promise<Record<string, unknown>> {
  const result = await billyFetch("/files", {
    method: "POST",
    body: { file: { filename, data: dataBase64 } },
  }) as Record<string, unknown>;
  return (result.file ?? result) as Record<string, unknown>;
}

export async function createAttachment(data: {
  readonly ownerId: string;
  readonly ownerReference: string;
  readonly fileId: string;
}): Promise<Record<string, unknown>> {
  const result = await billyFetch("/attachments", {
    method: "POST",
    body: { attachment: data },
  }) as Record<string, unknown>;
  return (result.attachment ?? result) as Record<string, unknown>;
}

export async function createBill(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await billyFetch("/bills", {
    method: "POST",
    body: { bill: data },
  }) as Record<string, unknown>;
  return (result.bill ?? result) as Record<string, unknown>;
}

export async function getContacts(q?: string): Promise<Array<Record<string, unknown>>> {
  const result = await billyFetch("/contacts", {
    params: { q, isSupplier: true, pageSize: 10 },
  }) as Record<string, unknown>;
  return (result.contacts ?? []) as Array<Record<string, unknown>>;
}

export async function getTaxRates(): Promise<Array<Record<string, unknown>>> {
  const result = await billyFetch("/taxRates", { params: { pageSize: 100 } }) as Record<string, unknown>;
  return (result.taxRates ?? []) as Array<Record<string, unknown>>;
}
