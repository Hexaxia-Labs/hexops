import type { SecurityPlugin } from './types';
import { SafeChainPlugin } from './safe-chain/plugin';

/**
 * Static plugin registry.
 *
 * Add a new plugin:
 *   1. Create a directory under src/lib/security/plugins/<id>/
 *   2. Export a `SecurityPlugin`-typed object from that directory
 *   3. Import it here and add it to the array below.
 *
 * Order is the on-screen order of the cards.
 */
export const SECURITY_PLUGINS: ReadonlyArray<SecurityPlugin> = [SafeChainPlugin];

export function getPlugin(id: string): SecurityPlugin | undefined {
  return SECURITY_PLUGINS.find((p) => p.id === id);
}
