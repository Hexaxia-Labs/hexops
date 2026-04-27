export function buildYarnInstallCmd(specs: string | string[], isWorkspace: boolean): string {
  const s = Array.isArray(specs) ? specs.join(' ') : specs;
  return isWorkspace ? `yarn workspaces foreach add ${s}` : `yarn add ${s}`;
}

export function buildYarnUpdateCmd(isWorkspace: boolean): string {
  return isWorkspace ? 'yarn workspaces foreach upgrade' : 'yarn upgrade';
}
