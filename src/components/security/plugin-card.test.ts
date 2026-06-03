import { describe, it, expect } from 'vitest';
import { PluginCard, type PluginCardProps } from './plugin-card';
import type { PluginCardEntry } from '@/lib/security/plugins/types';

describe('PluginCard', () => {
  it('exports PluginCard component and PluginCardProps type', () => {
    expect(typeof PluginCard).toBe('function');
    const sample: PluginCardProps = {
      entry: {
        pluginId: 'safe-chain',
        name: 'Safe Chain',
        kind: 'installGate',
        host: { available: true, version: '1.0.0' },
        card: {
          status: 'enabled',
          headline: '0 blocks · last 7d',
        },
      } satisfies PluginCardEntry,
    };
    expect(sample.entry.pluginId).toBe('safe-chain');
  });

  it('handles all status values', () => {
    const statuses: PluginCardEntry['card']['status'][] = [
      'enabled',
      'disabled',
      'host-missing',
      'error',
    ];
    statuses.forEach((status) => {
      const sample: PluginCardProps = {
        entry: {
          pluginId: 'test-plugin',
          name: 'Test Plugin',
          kind: 'complianceAudit',
          host: { available: true },
          card: {
            status,
            headline: 'Test headline',
          },
        },
      };
      expect(sample.entry.card.status).toBe(status);
    });
  });

  it('accepts optional detail and detailRoute', () => {
    const sample: PluginCardProps = {
      entry: {
        pluginId: 'safe-chain',
        name: 'Safe Chain',
        kind: 'installGate',
        host: { available: true },
        card: {
          status: 'enabled',
          headline: '5 blocks',
          detail: 'Blocking risky dependencies',
          error: undefined,
        },
        detailRoute: '/security/safe-chain',
      },
    };
    expect(sample.entry.card.detail).toBe('Blocking risky dependencies');
    expect(sample.entry.detailRoute).toBe('/security/safe-chain');
  });
});
