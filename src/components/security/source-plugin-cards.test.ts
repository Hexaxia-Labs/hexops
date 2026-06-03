import { describe, it, expect } from 'vitest';
import { SourcePluginCards, type SourcePluginCardsProps } from './source-plugin-cards';
import type { SourceResult } from '@/lib/security/types';
import type { PluginCardEntry } from '@/lib/security/plugins/types';

describe('SourcePluginCards', () => {
  it('exports SourcePluginCards component and SourcePluginCardsProps type', () => {
    expect(typeof SourcePluginCards).toBe('function');
    const sample: SourcePluginCardsProps = {
      sources: {
        'pnpm-audit': {
          id: 'pnpm-audit',
          status: 'ok',
          startedAt: '2026-05-26T15:00:00Z',
          durationMs: 100,
          findingCount: 2,
        } satisfies SourceResult,
      },
      plugins: [],
    };
    expect(Object.keys(sample.sources)).toContain('pnpm-audit');
  });

  it('accepts multiple sources and plugins', () => {
    const sample: SourcePluginCardsProps = {
      sources: {
        'pnpm-audit': {
          id: 'pnpm-audit',
          status: 'ok',
          startedAt: '2026-05-26T15:00:00Z',
          durationMs: 100,
          findingCount: 1,
        },
        grype: {
          id: 'grype',
          status: 'failed',
          startedAt: '2026-05-26T15:00:00Z',
          durationMs: 500,
          findingCount: 0,
          error: 'grype not found',
        },
      },
      plugins: [
        {
          pluginId: 'safe-chain',
          name: 'Safe Chain',
          kind: 'installGate',
          host: { available: true },
          card: {
            status: 'enabled',
            headline: '0 blocks',
          },
        } satisfies PluginCardEntry,
      ],
    };
    expect(Object.keys(sample.sources).length).toBe(2);
    expect(sample.plugins.length).toBe(1);
  });

  it('accepts optional sourceDeepLinks', () => {
    const sample: SourcePluginCardsProps = {
      sources: {
        'cve-lite': {
          id: 'cve-lite',
          status: 'ok',
          startedAt: '2026-05-26T15:00:00Z',
          durationMs: 200,
          findingCount: 3,
        },
      },
      plugins: [],
      sourceDeepLinks: {
        'cve-lite': '/security/cve-lite',
      },
    };
    expect(sample.sourceDeepLinks?.['cve-lite']).toBe('/security/cve-lite');
  });
});
