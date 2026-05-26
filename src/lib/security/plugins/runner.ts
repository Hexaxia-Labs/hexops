import type { ProjectConfig } from '../../types';
import type { PluginCardData, PluginHostStatus, SecurityPlugin } from './types';

export interface PluginCardEntry {
  pluginId: string;
  name: string;
  kind: SecurityPlugin['kind'];
  host: PluginHostStatus;
  card: PluginCardData;
  detailRoute?: string;
}

/**
 * Run isAvailable + renderCard for every plugin in parallel.
 * Errors from any single plugin become an `error`-status card; they do not
 * affect other plugins or the overall promise.
 */
export async function runAllPluginCards(
  project: ProjectConfig,
  plugins: ReadonlyArray<SecurityPlugin>,
): Promise<PluginCardEntry[]> {
  return Promise.all(plugins.map(async (p) => runOne(project, p)));
}

async function runOne(project: ProjectConfig, p: SecurityPlugin): Promise<PluginCardEntry> {
  let host: PluginHostStatus;
  let card: PluginCardData;
  try {
    host = await p.isAvailable();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      pluginId: p.id,
      name: p.name,
      kind: p.kind,
      host: { available: false, reason: `isAvailable threw: ${msg}` },
      card: { status: 'error', headline: 'plugin error', error: msg },
      detailRoute: p.detailRoute,
    };
  }

  try {
    card = await p.renderCard(project);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    card = { status: 'error', headline: 'plugin error', error: msg };
  }

  return {
    pluginId: p.id,
    name: p.name,
    kind: p.kind,
    host,
    card,
    detailRoute: p.detailRoute,
  };
}
