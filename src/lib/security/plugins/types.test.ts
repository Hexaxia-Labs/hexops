import { describe, it, expectTypeOf } from 'vitest';
import type {
  PluginKind,
  SecurityPluginBase,
  InstallGatePlugin,
  ComplianceAuditPlugin,
  SecurityPlugin,
  PluginHostStatus,
  PluginCardData,
  InstallGateWrapped,
  InstallGateResult,
} from './types';

describe('SecurityPlugin types', () => {
  it('PluginKind covers expected variants', () => {
    expectTypeOf<PluginKind>().toEqualTypeOf<'installGate' | 'complianceAudit'>();
  });

  it('SecurityPlugin is the union of capability-typed plugins', () => {
    expectTypeOf<SecurityPlugin>().toEqualTypeOf<InstallGatePlugin | ComplianceAuditPlugin>();
  });

  it('InstallGatePlugin discriminates on kind', () => {
    const sample = {} as InstallGatePlugin;
    expectTypeOf(sample.kind).toEqualTypeOf<'installGate'>();
    expectTypeOf(sample.wrapInstall).toBeFunction();
  });
});
