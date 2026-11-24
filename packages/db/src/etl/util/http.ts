/** JSON from the web for the fetchers and extractors, retried when the request fails. */

const USER_AGENT = 'atm-fetcher/1.0';

async function request(url: string, retries: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    } catch (err) {
      if (attempt >= retries) throw err;
    }
  }
}

/** The JSON at a URL; an answer other than 2xx counts as a failure and is retried. */
export async function getJson<T>(url: string, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await request(url, 0);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as T;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
  }
}

/** The JSON at a URL, or null when the server has none there or answers with something else. */
export async function findJson<T>(url: string, retries = 2): Promise<T | null> {
  const res = await request(url, retries);
  if (!res.ok) {
    return null;
  }
  try {
    return await res.json() as T;
  } catch {
    return null;
  }
}
