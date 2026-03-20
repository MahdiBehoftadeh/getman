import { useMemo, useState } from 'react';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type SendMode = 'LIVE' | 'MOCK';

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
  tests: string;
  mode: SendMode;
  createdAt: string;
};

type ResponseState = {
  status: number;
  statusText: string;
  timeMs: number;
  headers: [string, string][];
  body: string;
};

type TestResult = {
  label: string;
  passed: boolean;
  details: string;
};

const LOCAL_STORAGE_KEY = 'getman_saved_requests_v2';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-cyan-400',
  PUT: 'text-amber-400',
  PATCH: 'text-fuchsia-400',
  DELETE: 'text-rose-400',
};

function parseSavedRequests(): SavedRequest[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return [];

  try {
    const data = JSON.parse(raw) as SavedRequest[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function parseHeaders(headersText: string): HeaderItem[] {
  const lines = headersText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return null;

      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      } as HeaderItem;
    })
    .filter((header): header is HeaderItem => Boolean(header));
}

function tryJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function runTests(script: string, response: ResponseState): TestResult[] {
  const lines = script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (lines.length === 0) {
    return [];
  }

  const bodyJson = tryJsonParse(response.body) as Record<string, unknown> | null;
  const headerMap = new Map(response.headers.map(([k, v]) => [k.toLowerCase(), v]));

  return lines.map((line) => {
    if (line.startsWith('status =')) {
      const expected = Number(line.replace('status =', '').trim());
      const passed = Number.isFinite(expected) && response.status === expected;
      return {
        label: line,
        passed,
        details: passed ? 'Status matched.' : `Expected ${expected}, got ${response.status}.`,
      };
    }

    if (line.startsWith('body includes ')) {
      const expected = line.replace('body includes ', '').trim();
      const passed = response.body.includes(expected);
      return {
        label: line,
        passed,
        details: passed ? 'Found expected body text.' : `Body did not include "${expected}".`,
      };
    }

    if (line.startsWith('header ')) {
      const remainder = line.replace('header ', '').trim();
      const [headerName, expected] = remainder.split(' includes ').map((part) => part?.trim());

      if (!headerName || !expected) {
        return {
          label: line,
          passed: false,
          details: 'Use format: header <name> includes <value>.',
        };
      }

      const actual = headerMap.get(headerName.toLowerCase()) || '';
      const passed = actual.includes(expected);
      return {
        label: line,
        passed,
        details: passed ? 'Header value matched.' : `Header was "${actual || '(missing)'}".`,
      };
    }

    if (line.startsWith('json ')) {
      const remainder = line.replace('json ', '').trim();
      const [path, expectedRaw] = remainder.split(' = ').map((part) => part?.trim());

      if (!path || !expectedRaw) {
        return {
          label: line,
          passed: false,
          details: 'Use format: json <field> = <value>.',
        };
      }

      const expectedValue: unknown = expectedRaw === 'true'
        ? true
        : expectedRaw === 'false'
          ? false
          : Number.isNaN(Number(expectedRaw))
            ? expectedRaw
            : Number(expectedRaw);

      const actual = bodyJson && path in bodyJson ? bodyJson[path] : undefined;
      const passed = actual === expectedValue;

      return {
        label: line,
        passed,
        details: passed ? 'JSON field matched.' : `Expected ${String(expectedValue)}, got ${String(actual)}.`,
      };
    }

    return {
      label: line,
      passed: false,
      details: 'Unknown rule. Try: status =, body includes, header <name> includes, json <field> =.',
    };
  });
}

function App() {
  const [mode, setMode] = useState<SendMode>('LIVE');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('Content-Type: application/json');
  const [body, setBody] = useState('');
  const [tests, setTests] = useState('status = 200');
  const [requestName, setRequestName] = useState('');
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>(() => parseSavedRequests());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const parsedHeaders = useMemo(() => parseHeaders(headersText), [headersText]);
  const canHaveBody = method !== 'GET';

  const persistRequests = (nextRequests: SavedRequest[]) => {
    setSavedRequests(nextRequests);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextRequests));
  };

  const saveCurrentRequest = () => {
    if (mode === 'LIVE' && !url.trim()) {
      setError('URL is required before saving a live request.');
      return;
    }

    const newRequest: SavedRequest = {
      id: crypto.randomUUID(),
      name: requestName.trim() || `${method} ${mode === 'MOCK' ? 'mock://local' : url}`,
      method,
      url,
      headers: parsedHeaders,
      body,
      tests,
      mode,
      createdAt: new Date().toISOString(),
    };

    persistRequests([newRequest, ...savedRequests]);
    setRequestName('');
    setError(null);
  };

  const loadRequest = (request: SavedRequest) => {
    setMode(request.mode);
    setMethod(request.method);
    setUrl(request.url);
    setHeadersText(request.headers.map((header) => `${header.key}: ${header.value}`).join('\n'));
    setBody(request.body);
    setTests(request.tests || '');
    setError(null);
  };

  const deleteRequest = (requestId: string) => {
    const nextRequests = savedRequests.filter((request) => request.id !== requestId);
    persistRequests(nextRequests);
  };

  const sendRequest = async () => {
    if (mode === 'LIVE' && !url.trim()) {
      setError('Enter a URL before sending a live request.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setTestResults([]);

    const startedAt = performance.now();

    try {
      if (mode === 'MOCK') {
        const elapsed = performance.now() - startedAt;
        const mockBody = body.trim() || JSON.stringify({ ok: true, message: 'Offline mock response from Getman.' }, null, 2);

        const mockResponse: ResponseState = {
          status: 200,
          statusText: 'OK (Mock)',
          timeMs: elapsed,
          headers: [['content-type', 'application/json'], ['x-getman-mode', 'mock']],
          body: mockBody,
        };

        setResponse(mockResponse);
        setTestResults(runTests(tests, mockResponse));
        return;
      }

      const headers = new Headers();
      parsedHeaders.forEach((header) => {
        if (header.key) {
          headers.set(header.key, header.value);
        }
      });

      const res = await fetch(url, {
        method,
        headers,
        body: canHaveBody && body.trim() ? body : undefined,
      });

      const elapsed = performance.now() - startedAt;
      const resText = await res.text();

      const nextResponse = {
        status: res.status,
        statusText: res.statusText,
        timeMs: elapsed,
        headers: Array.from(res.headers.entries()),
        body: resText,
      };

      setResponse(nextResponse);
      setTestResults(runTests(tests, nextResponse));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected request error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.75fr_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40">
          <h1 className="text-2xl font-semibold">Getman</h1>
          <p className="mt-1 text-sm text-slate-400">Postman-style API testing with offline mock mode and saved requests.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => setMode('LIVE')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'LIVE' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-300'}`}
            >
              Live HTTP
            </button>
            <button
              onClick={() => setMode('MOCK')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'MOCK' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300'}`}
            >
              Offline Mock
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[130px_1fr_auto]">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as HttpMethod)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-semibold"
            >
              {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={mode === 'MOCK' ? 'mock://local (optional)' : 'https://api.example.com/items'}
              disabled={mode === 'MOCK'}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
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

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-300">Tests</label>
            <textarea
              value={tests}
              onChange={(event) => setTests(event.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm"
              placeholder={['# one rule per line', 'status = 200', 'body includes success', 'header content-type includes json', 'json id = 1'].join('\n')}
            />
            <p className="mt-2 text-xs text-slate-500">Rules: <code>status =</code>, <code>body includes</code>, <code>header &lt;name&gt; includes</code>, <code>json &lt;field&gt; =</code>.</p>
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
                <span className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-emerald-300">{response.status} {response.statusText}</span>
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
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{response.body || 'No body'}</pre>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-300">Test Results</h2>
                {testResults.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-400">No tests were defined.</p>
                ) : (
                  <div className="space-y-2">
                    {testResults.map((result) => (
                      <div key={`${result.label}-${result.details}`} className={`rounded-lg border px-3 py-2 text-xs ${result.passed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                        <p className="font-semibold">{result.passed ? 'PASS' : 'FAIL'} — {result.label}</p>
                        <p className="mt-1 opacity-90">{result.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Saved Requests</h2>
            <button
              onClick={() => persistRequests([])}
              disabled={savedRequests.length === 0}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Clear All
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {savedRequests.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">Save requests to create your reusable collection.</p>
            )}

            {savedRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => loadRequest(request)} className="text-left hover:underline">
                    <p className={`text-xs font-semibold ${methodColors[request.method]}`}>{request.method}</p>
                    <p className="mt-1 max-w-52 truncate text-sm font-medium">{request.name}</p>
                  </button>
                  <button onClick={() => deleteRequest(request.id)} className="text-xs text-rose-300 hover:text-rose-200">Delete</button>
                </div>

                <p className="mt-2 truncate text-xs text-slate-500" title={request.url || 'mock://local'}>{request.url || 'mock://local'}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">{request.mode} • {new Date(request.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
