import { useMemo, useState } from 'react';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type HeaderItem = {
  key: string;
  value: string;
};

type SavedRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: HeaderItem[];
  body: string;
  createdAt: string;
};

type ResponseState = {
  status: number;
  statusText: string;
  timeMs: number;
  headers: [string, string][];
  body: string;
};

const LOCAL_STORAGE_KEY = 'getman_saved_requests_v1';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-cyan-400',
  PUT: 'text-amber-400',
  PATCH: 'text-fuchsia-400',
  DELETE: 'text-rose-400',
};

function parseSavedRequests(): SavedRequest[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const data = JSON.parse(raw) as SavedRequest[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function App() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/todos/1');
  const [headersText, setHeadersText] = useState('Content-Type: application/json');
  const [body, setBody] = useState('');
  const [requestName, setRequestName] = useState('');
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>(() => parseSavedRequests());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ResponseState | null>(null);

  const parsedHeaders = useMemo(() => {
    const lines = headersText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const headers: HeaderItem[] = [];
    for (const line of lines) {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      headers.push({
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      });
    }

    return headers;
  }, [headersText]);

  const canHaveBody = method !== 'GET' && method !== 'DELETE';

  const persistRequests = (nextRequests: SavedRequest[]) => {
    setSavedRequests(nextRequests);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextRequests));
  };

  const saveCurrentRequest = () => {
    if (!url.trim()) {
      setError('URL is required before saving a request.');
      return;
    }

    const newRequest: SavedRequest = {
      id: crypto.randomUUID(),
      name: requestName.trim() || `${method} ${url}`,
      method,
      url,
      headers: parsedHeaders,
      body,
      createdAt: new Date().toISOString(),
    };

    persistRequests([newRequest, ...savedRequests]);
    setRequestName('');
    setError(null);
  };

  const loadRequest = (request: SavedRequest) => {
    setMethod(request.method);
    setUrl(request.url);
    setHeadersText(request.headers.map((header) => `${header.key}: ${header.value}`).join('\n'));
    setBody(request.body);
    setError(null);
  };

  const deleteRequest = (requestId: string) => {
    const nextRequests = savedRequests.filter((request) => request.id !== requestId);
    persistRequests(nextRequests);
  };

  const clearAllRequests = () => {
    persistRequests([]);
  };

  const sendRequest = async () => {
    if (!url.trim()) {
      setError('Enter a URL before sending the request.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    const headers = new Headers();
    parsedHeaders.forEach((header) => {
      if (header.key) {
        headers.set(header.key, header.value);
      }
    });

    const startedAt = performance.now();

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: canHaveBody && body.trim() ? body : undefined,
      });

      const elapsed = performance.now() - startedAt;
      const resText = await res.text();

      setResponse({
        status: res.status,
        statusText: res.statusText,
        timeMs: elapsed,
        headers: Array.from(res.headers.entries()),
        body: resText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected request error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40">
          <h1 className="text-2xl font-semibold">Getman</h1>
          <p className="mt-1 text-sm text-slate-400">A lightweight Postman-style API request tester.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-[130px_1fr_auto]">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as HttpMethod)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-semibold"
            >
              {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.example.com/items"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            />

            <button
              onClick={sendRequest}
              disabled={loading}
              className="rounded-lg bg-cyan-600 px-5 py-2 font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Headers (one per line)</label>
              <textarea
                value={headersText}
                onChange={(event) => setHeadersText(event.target.value)}
                rows={8}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm"
                placeholder="Authorization: Bearer ..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Body {canHaveBody ? '(raw)' : '(disabled for this method)'}
              </label>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                disabled={!canHaveBody}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm disabled:opacity-60"
                placeholder='{"name":"demo"}'
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={requestName}
              onChange={(event) => setRequestName(event.target.value)}
              placeholder="Request name (optional)"
              className="min-w-72 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            />
            <button
              onClick={saveCurrentRequest}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
            >
              Save Request
            </button>
          </div>

          {error && <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

          {response && (
            <div className="mt-6 space-y-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-emerald-300">
                  {response.status} {response.statusText}
                </span>
                <span className="text-slate-400">{response.timeMs.toFixed(0)} ms</span>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-300">Response Headers</h2>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
                  {response.headers.map(([key, value]) => `${key}: ${value}`).join('\n') || 'No response headers'}
                </pre>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-300">Response Body</h2>
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {response.body || 'No body'}
                </pre>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Saved Requests</h2>
            <button
              onClick={clearAllRequests}
              disabled={savedRequests.length === 0}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Clear All
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {savedRequests.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                Save requests to create your own reusable collection.
              </p>
            )}

            {savedRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => loadRequest(request)}
                    className="text-left hover:underline"
                  >
                    <p className={`text-xs font-semibold ${methodColors[request.method]}`}>{request.method}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium">{request.name}</p>
                  </button>
                  <button
                    onClick={() => deleteRequest(request.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>

                <p className="mt-2 truncate text-xs text-slate-500" title={request.url}>
                  {request.url}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
