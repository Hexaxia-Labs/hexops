import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type CodeScanSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface CodeScanFinding {
  rule: string;
  severity: CodeScanSeverity;
  category: string;
  file: string;
  line: number;
  snippet: string;
  message: string;
}

export interface CodeScanResult {
  projectId: string;
  timestamp: string;
  duration: number;
  findings: CodeScanFinding[];
  scannedFiles: number;
  ignored: number;
}

interface ScanRule {
  id: string;
  pattern: string;
  severity: CodeScanSeverity;
  category: string;
  message: string;
  includeExts?: string[];
}

const RULES: ScanRule[] = [
  // Hardcoded secrets
  { id: 'hardcoded-api-key', pattern: '(?i)(api[_-]?key|apikey)\\s*[=:][\\s"\']\\s*[A-Za-z0-9_\\-]{20,}', severity: 'critical', category: 'secrets', message: 'Possible hardcoded API key' },
  { id: 'hardcoded-password', pattern: '(?i)(password|passwd|pwd)\\s*[=:][\\s"\']\\s*[^\\s"\']{8,}', severity: 'critical', category: 'secrets', message: 'Possible hardcoded password' },
  { id: 'hardcoded-token', pattern: '(?i)(access[_-]?token|auth[_-]?token|bearer[_-]?token)\\s*[=:][\\s"\']\\s*[A-Za-z0-9_\\-\\.]{20,}', severity: 'critical', category: 'secrets', message: 'Possible hardcoded token' },
  { id: 'aws-key', pattern: 'AKIA[0-9A-Z]{16}', severity: 'critical', category: 'secrets', message: 'Possible AWS access key' },
  { id: 'private-key', pattern: '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY', severity: 'critical', category: 'secrets', message: 'Private key in source' },
  { id: 'hardcoded-secret', pattern: '(?i)(secret|jwt[_-]?secret)\\s*[=:][\\s"\']\\s*[^\\s"\']{8,}', severity: 'high', category: 'secrets', message: 'Possible hardcoded secret' },

  // Dangerous APIs
  { id: 'eval-usage', pattern: '\\beval\\s*\\(', severity: 'high', category: 'dangerous-api', message: 'eval() is dangerous — enables arbitrary code execution', includeExts: ['.js', '.ts', '.jsx', '.tsx'] },
  { id: 'dangerous-innerhtml', pattern: 'dangerouslySetInnerHTML\\s*=\\s*\\{\\s*\\{\\s*__html\\s*:', severity: 'medium', category: 'dangerous-api', message: 'dangerouslySetInnerHTML can enable XSS', includeExts: ['.jsx', '.tsx'] },
  { id: 'innerhtml-assign', pattern: '\\.innerHTML\\s*=\\s*[^"\']', severity: 'medium', category: 'injection', message: 'Direct innerHTML assignment with dynamic content (XSS risk)' },
  { id: 'document-write', pattern: 'document\\.write\\s*\\(', severity: 'medium', category: 'dangerous-api', message: 'document.write() is unsafe' },

  // Command injection
  { id: 'exec-with-template', pattern: 'exec\\s*\\(`[^`]*\\$\\{', severity: 'high', category: 'injection', message: 'exec() with template literal — potential command injection', includeExts: ['.js', '.ts'] },
  { id: 'execsync-with-template', pattern: 'execSync\\s*\\(`[^`]*\\$\\{', severity: 'high', category: 'injection', message: 'execSync() with template literal — potential command injection', includeExts: ['.js', '.ts'] },

  // Weak crypto
  { id: 'md5-usage', pattern: '(?i)(?:create|use|hash|md5|require[^)]*)["\']md5["\']|createHash\\s*\\(["\']md5["\']', severity: 'medium', category: 'weak-crypto', message: 'MD5 is cryptographically broken — use SHA-256 or better' },
  { id: 'sha1-usage', pattern: 'createHash\\s*\\(["\']sha1["\']', severity: 'medium', category: 'weak-crypto', message: 'SHA-1 is weak — use SHA-256 or better' },
  { id: 'math-random-security', pattern: 'Math\\.random\\s*\\(\\).*(?:token|secret|key|salt|nonce|csrf)', severity: 'high', category: 'weak-crypto', message: 'Math.random() is not cryptographically secure — use crypto.randomBytes()' },

  // Misconfiguration
  { id: 'cors-wildcard', pattern: '(?i)Access-Control-Allow-Origin["\']?\\s*[=:,]\\s*["\']?\\*', severity: 'medium', category: 'misconfiguration', message: 'CORS wildcard (*) allows any origin' },
  { id: 'http-only-false', pattern: '(?i)httpOnly\\s*[=:][\\s]*false', severity: 'medium', category: 'misconfiguration', message: 'Cookie without HttpOnly flag (accessible to JavaScript)' },
  { id: 'debug-true', pattern: '(?i)debug\\s*[=:][\\s]*true', severity: 'low', category: 'misconfiguration', message: 'Debug mode enabled — may expose sensitive information' },

  // Sensitive data in logs
  { id: 'log-password', pattern: '(?i)(console\\.log|logger\\.(info|debug|warn))\\s*\\([^)]*password', severity: 'high', category: 'data-exposure', message: 'Possible password logged to console' },
];

const DEFAULT_IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];
const DEFAULT_INCLUDE_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.env', '.json', '.yaml', '.yml', '.sh'];

function loadIgnoreList(projectPath: string): Set<string> {
  const ignoreFile = join(projectPath, '.hexops-ignore');
  if (!existsSync(ignoreFile)) return new Set();
  try {
    return new Set(
      readFileSync(ignoreFile, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
    );
  } catch {
    return new Set();
  }
}

export async function scanProjectCode(projectPath: string, projectId: string): Promise<CodeScanResult> {
  const start = Date.now();
  const ignoredRules = loadIgnoreList(projectPath);
  const activeRules = RULES.filter(r => !ignoredRules.has(r.id));
  const findings: CodeScanFinding[] = [];
  let scannedFiles = 0;
  let ignoredFiles = 0;

  // Get file list via find, excluding ignore dirs
  const excludes = DEFAULT_IGNORE_DIRS.map(d => `--exclude-dir=${d}`).join(' ');
  const exts = DEFAULT_INCLUDE_EXTS.map(e => `--include="*${e}"`).join(' ');

  for (const rule of activeRules) {
    const ruleExts = rule.includeExts
      ? rule.includeExts.map(e => `--include="*${e}"`).join(' ')
      : exts;

    try {
      const cmd = `grep -rn -P "${rule.pattern}" ${excludes} ${ruleExts} "${projectPath}" 2>/dev/null || true`;
      const output = execSync(cmd, { maxBuffer: 1024 * 1024, timeout: 15000 }).toString();

      for (const line of output.split('\n').filter(Boolean)) {
        // grep output: path:linenum:content
        const colonIdx = line.indexOf(':');
        const rest = line.slice(colonIdx + 1);
        const lineNumIdx = rest.indexOf(':');
        if (colonIdx === -1 || lineNumIdx === -1) continue;

        const filePath = line.slice(0, colonIdx);
        const lineNum = parseInt(rest.slice(0, lineNumIdx), 10);
        const snippet = rest.slice(lineNumIdx + 1).trim().slice(0, 200);

        // Relativize path
        const relPath = filePath.startsWith(projectPath)
          ? filePath.slice(projectPath.length).replace(/^\//, '')
          : filePath;

        // Skip .env files only for non-secret rules
        if (relPath.endsWith('.env') && rule.category !== 'secrets') continue;

        findings.push({
          rule: rule.id,
          severity: rule.severity,
          category: rule.category,
          file: relPath,
          line: lineNum,
          snippet,
          message: rule.message,
        });
      }
    } catch { /* grep not found or timeout */ }
  }

  // Deduplicate by (file, line, rule)
  const seen = new Set<string>();
  const deduped = findings.filter(f => {
    const key = `${f.file}:${f.line}:${f.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    projectId,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
    findings: deduped,
    scannedFiles,
    ignored: ignoredFiles,
  };
}
