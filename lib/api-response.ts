/** Read an object-shaped API response without exposing HTML, raw payloads or parser errors. */
export async function readApiResponse<T = Record<string, any>>(response: Response): Promise<T> {
  const suffix = response.ok ? '' : ` (HTTP ${response.status})`;
  if (response.redirected && /\/login(?:[/?#]|$)/.test(response.url)) {
    throw new Error('Your session has expired. Sign in again and retry.');
  }
  let text: string;
  try { text = await response.text(); }
  catch { throw new Error('The server response was interrupted. Check your connection and try again.'); }
  if (!text.trim()) throw new Error(response.status === 401 ? 'Your session has expired. Sign in again and retry.' : `The server returned an empty response${suffix}. Refresh the page and try again.`);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error(`The server returned an unreadable response${suffix}. Refresh the page and try again.`); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
    throw new Error(`The server returned an incomplete response${suffix}. Please try again.`);
  }
  return data as T;
}
