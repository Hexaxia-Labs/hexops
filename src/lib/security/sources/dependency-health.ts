// Node builtins (roots only; subpaths reduce to root via rootPkg, node: handled by isBare)
const BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib', 'test',
]);

const RE_FROM = /(?:import|export)\s+(?:type\s+)?([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g;
const RE_SIDE = /(?:^|[;{}])\s*import\s*['"]([^'"]+)['"]/g;
const RE_REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function rootPkg(spec: string): string {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split('/')[0];
}

function isBare(spec: string): boolean {
  return !(
    spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:') ||
    spec.startsWith('@/') || spec.startsWith('~') || spec.startsWith('#')
  );
}

function isTypeOnlyImport(matchText: string, body: string): boolean {
  if (/^\s*(?:import|export)\s+type\b/.test(matchText)) return true;
  const b = body.trim();
  if (b.startsWith('{') && b.endsWith('}')) {
    const parts = b.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && parts.every((p) => /^type\s/.test(p))) return true;
  }
  return false;
}

export function collectValueImports(content: string): Set<string> {
  const src = stripComments(content);
  const found = new Set<string>();
  const consider = (spec: string) => {
    if (!isBare(spec)) return;
    const root = rootPkg(spec);
    if (BUILTINS.has(root)) return;
    found.add(root);
  };
  let m: RegExpExecArray | null;
  RE_FROM.lastIndex = 0;
  while ((m = RE_FROM.exec(src))) {
    if (isTypeOnlyImport(m[0], m[1] ?? '')) continue;
    consider(m[2]);
  }
  RE_SIDE.lastIndex = 0;
  while ((m = RE_SIDE.exec(src))) consider(m[1]);
  RE_REQUIRE.lastIndex = 0;
  while ((m = RE_REQUIRE.exec(src))) consider(m[1]);
  return found;
}
