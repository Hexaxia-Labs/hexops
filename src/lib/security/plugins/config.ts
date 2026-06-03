import type { ProjectConfig, ProjectPluginConfig } from '../../types';

export function getProjectPluginConfig(project: ProjectConfig, pluginId: string): ProjectPluginConfig | undefined {
  return project.plugins?.[pluginId];
}

export function isPluginEnabledForProject(project: ProjectConfig, pluginId: string): boolean {
  return getProjectPluginConfig(project, pluginId)?.enabled === true;
}

/**
 * Update a project's per-plugin config and persist via the injected writer.
 * Caller passes the writer (typically `writeProjectConfig` from src/lib/config.ts)
 * so this module stays unit-testable without touching disk.
 */
export type ProjectWriter = (next: ProjectConfig) => Promise<void> | void;

export async function setProjectPluginConfig(
  project: ProjectConfig,
  pluginId: string,
  config: ProjectPluginConfig,
  write: ProjectWriter,
): Promise<ProjectConfig> {
  const next: ProjectConfig = {
    ...project,
    plugins: {
      ...(project.plugins ?? {}),
      [pluginId]: { ...(project.plugins?.[pluginId] ?? {}), ...config },
    },
  };
  await write(next);
  return next;
}
