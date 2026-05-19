import type { Finding } from './types';

export function computeDedupKey(f: Finding): string {
  switch (f.type) {
    case 'vulnerability': {
      const ghsa = f.advisoryIds.find((id) => id.startsWith('GHSA-'));
      if (ghsa) return `vuln:${ghsa}`;
      const cve = f.advisoryIds.find((id) => id.startsWith('CVE-'));
      if (cve) return `vuln:${cve}`;
      return `vuln:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    }
    case 'integrity':
      return `integ:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    case 'secret': {
      const fp = (f.detail.match(/fp:([a-z0-9]+)/i)?.[1]) ?? '?';
      return `secret:${f.path ?? '?'}|${fp}`;
    }
    case 'license':
      return `lic:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    case 'config':
      return `config:${f.path ?? '?'}|${f.title}`;
  }
}
