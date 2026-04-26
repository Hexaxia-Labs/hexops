import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/lib/config'
import { addEscalation, removeEscalation, getEscalationConfig } from '@/lib/escalation-store'
import { resolveLockfile } from '@/lib/lockfile-resolver'
import { detectPackageManager } from '@/lib/patch-scanner'
import type { EscalateAction, EscalateRecord, PackageManager } from '@/lib/types'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

async function verifyOverrideAuditClear(cwd: string, pm: string, pkgName: string): Promise<boolean> {
  try {
    const auditCmd =
      pm === 'pnpm' ? 'pnpm audit --json 2>/dev/null || true' :
      pm === 'yarn' ? 'yarn audit --json 2>/dev/null || true' :
      'npm audit --json 2>/dev/null || true'
    const { stdout } = await execAsync(auditCmd, { cwd, timeout: 60000 })
    const jsonStart = stdout.lastIndexOf('{')
    if (jsonStart === -1) return true
    const data = JSON.parse(stdout.slice(jsonStart))
    return !(pkgName in (data?.vulnerabilities ?? {}))
  } catch {
    return true // Can't run audit — non-fatal, assume clear
  }
}

const LOCK_FILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
}

interface EscalateRequestBody {
  package: string
  action: EscalateAction
  reason: string
  overrideVersion?: string
  targetVersion?: string
  expiresAt?: string
  emergency?: boolean
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const project = getProject(id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: EscalateRequestBody = await request.json()
    const { package: pkg, action, reason, overrideVersion, targetVersion, expiresAt, emergency } = body

    if (!pkg || !action || !reason) {
      return NextResponse.json(
        { error: 'package, action, and reason are required' },
        { status: 400 }
      )
    }

    // Validate action
    const validActions: EscalateAction[] = ['force_override', 'force_major', 'accepted_risk']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Validate package name
    if (!pkg || !/^[@a-z0-9][\w\-./@]*$/i.test(pkg)) {
      return NextResponse.json({ error: 'Invalid package name' }, { status: 400 })
    }
    // Validate version strings (when present)
    if (overrideVersion && !/^(latest|next|canary|[\w\-.^~<>=|@]+)$/i.test(overrideVersion)) {
      return NextResponse.json({ error: 'Invalid override version' }, { status: 400 })
    }
    if (targetVersion && !/^(latest|next|canary|[\w\-.^~<>=|@]+)$/i.test(targetVersion)) {
      return NextResponse.json({ error: 'Invalid target version' }, { status: 400 })
    }

    const escalationCfg = getEscalationConfig(project)

    const record: EscalateRecord = {
      id: crypto.randomUUID(),
      projectId: id,
      package: pkg,
      action,
      reason,
      createdAt: new Date().toISOString(),
    }

    if (action === 'force_override') {
      if (!overrideVersion) {
        return NextResponse.json(
          { error: 'overrideVersion is required for force_override' },
          { status: 400 }
        )
      }

      record.overrideVersion = overrideVersion

      // Downgrade guard: refuse if overrideVersion is older than the currently installed version.
      // Mirrors the same guard in the update route — stale cache / advisory data can produce
      // an override target that is already superseded by what's installed.
      if (!/^(latest|next|canary)$/.test(overrideVersion)) {
        let installedVersion = ''
        try {
          const nmPath = join(project.path, 'node_modules', pkg, 'package.json')
          if (existsSync(nmPath)) {
            installedVersion = JSON.parse(readFileSync(nmPath, 'utf-8')).version || ''
          }
        } catch { /* can't read — skip guard */ }
        if (installedVersion) {
          const iv = installedVersion.replace(/^[\^~]/, '').split('.').map(n => parseInt(n, 10) || 0)
          const ov = overrideVersion.replace(/^[\^~]/, '').split('.').map(n => parseInt(n, 10) || 0)
          const isDowngrade = iv[0] > ov[0] || (iv[0] === ov[0] && iv[1] > ov[1]) || (iv[0] === ov[0] && iv[1] === ov[1] && (iv[2] ?? 0) > (ov[2] ?? 0))
          if (isDowngrade) {
            return NextResponse.json(
              { error: `Refused: ${overrideVersion} is older than installed ${installedVersion} — package is already past this fix` },
              { status: 409 }
            )
          }
        }
      }

      const pkgJsonPath = join(project.path, 'package.json')
      const pkgJsonRaw = readFileSync(pkgJsonPath, 'utf-8')
      const pkgJson = JSON.parse(pkgJsonRaw)

      // Detect package manager before writing overrides so we use the correct key
      const detectedPm = detectPackageManager(project.path) as PackageManager
      const lockfileName = LOCK_FILES[detectedPm]

      if (!lockfileName) {
        return NextResponse.json({ error: `Unknown package manager: ${detectedPm}` }, { status: 500 })
      }

      // Inject overrides using PM-aware key
      if (detectedPm === 'pnpm') {
        if (!pkgJson.pnpm) pkgJson.pnpm = {}
        if (!pkgJson.pnpm.overrides) pkgJson.pnpm.overrides = {}
        pkgJson.pnpm.overrides[pkg] = overrideVersion
      } else if (detectedPm === 'npm') {
        if (pkgJson.dependencies?.[pkg] !== undefined) {
          // npm EOVERRIDE: can't override a direct dep — update the dep version directly.
          pkgJson.dependencies[pkg] = overrideVersion
        } else {
          // For devDeps: remove first to avoid EOVERRIDE, then write the flat override.
          // Flat override is needed to fix nested copies (e.g. deep transitive pinned versions).
          if (!pkgJson.overrides) pkgJson.overrides = {}
          if (pkgJson.devDependencies?.[pkg] !== undefined) {
            delete pkgJson.devDependencies[pkg]
          }
          pkgJson.overrides[pkg] = overrideVersion
        }
      } else {
        // yarn uses "resolutions"
        if (!pkgJson.resolutions) pkgJson.resolutions = {}
        pkgJson.resolutions[pkg] = overrideVersion
      }

      const indent = pkgJsonRaw.match(/^(\s+)/m)?.[1] || '  '
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, indent) + '\n')

      // Regenerate lockfile to pick up the new override
      const lockfileResult = await resolveLockfile(project.path, 'repair')

      if (!lockfileResult.success) {
        // Revert package.json on failure
        await execFileAsync('git', ['checkout', '--', 'package.json'], { cwd: project.path, timeout: 30000 })
        return NextResponse.json(
          { error: `Lockfile regeneration failed: ${lockfileResult.error}` },
          { status: 500 }
        )
      }

      // Post-override audit verification: confirm the advisory is actually gone.
      // Nested copies (e.g. next pinning postcss@8.4.31) can survive an override install.
      const auditCleared = await verifyOverrideAuditClear(project.path, detectedPm, pkg)
      if (!auditCleared) {
        // Revert — override didn't actually fix it
        await execFileAsync('git', ['checkout', '--', 'package.json'], { cwd: project.path, timeout: 30000 })
        return NextResponse.json(
          { error: `Override applied but advisory still present after install — nested copy may have survived. Try deleting the lockfile and reinstalling, or use a version range that covers all copies.` },
          { status: 422 }
        )
      }

      // Commit + push based on escalation config or emergency flag
      const shouldCommit = escalationCfg.autoCommit || emergency
      const shouldPush = escalationCfg.autoPush || emergency

      // Helper to extract the most useful message from an execFile error
      const gitErrMsg = (e: unknown) => {
        if (e && typeof e === 'object' && 'stderr' in e && (e as { stderr?: string }).stderr) {
          return (e as { stderr: string }).stderr.trim()
        }
        return e instanceof Error ? e.message : String(e)
      }

      try {
        if (shouldCommit) {
          await execFileAsync('git', ['add', 'package.json', lockfileName], { cwd: project.path, timeout: 30000 })
          try {
            await execFileAsync('git', ['commit', '-m', `fix(deps): force override ${pkg}@${overrideVersion} — ${reason}`], { cwd: project.path, timeout: 30000 })
          } catch (commitErr) {
            const stderr = gitErrMsg(commitErr)
            // "nothing to commit" means this was already committed (e.g. a retry) — treat as success
            if (stderr.includes('nothing to commit') || stderr.includes('nothing added to commit')) {
              // fall through to push
            } else {
              throw commitErr
            }
          }
        }
        if (shouldPush) {
          try {
            await execFileAsync('git', ['push'], { cwd: project.path, timeout: 60000 })
          } catch (pushErr) {
            const pushMsg = gitErrMsg(pushErr)
            if (!pushMsg.includes('non-fast-forward') && !pushMsg.includes('rejected')) throw pushErr
            // Remote moved ahead (e.g. Dependabot) — rebase and retry
            await execFileAsync('git', ['pull', '--rebase', '--autostash'], { cwd: project.path, timeout: 60000 })
            await execFileAsync('git', ['push'], { cwd: project.path, timeout: 60000 })
          }
        }
      } catch (commitErr) {
        // Revert both package.json and lockfile on failure
        let revertNote = ''
        try {
          await execFileAsync('git', ['checkout', '--', 'package.json', lockfileName], { cwd: project.path, timeout: 30000 })
        } catch (revertErr) {
          revertNote = ` (revert also failed: ${gitErrMsg(revertErr)} — repo may be in a dirty state)`
        }
        return NextResponse.json({ error: `Commit/push failed: ${gitErrMsg(commitErr)}${revertNote}` }, { status: 500 })
      }
    } else if (action === 'force_major') {
      if (!targetVersion) {
        return NextResponse.json(
          { error: 'targetVersion is required for force_major' },
          { status: 400 }
        )
      }

      record.targetVersion = targetVersion

      const pkgJsonPath = join(project.path, 'package.json')
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

      for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
        if (pkgJson[section]?.[pkg]) {
          pkgJson[section][pkg] = `^${targetVersion}`
          break
        }
      }

      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
      // Do NOT commit — leave dirty for human review
    } else if (action === 'accepted_risk') {
      let expiryWarning: string | undefined
      if (expiresAt) {
        const maxDate = new Date()
        maxDate.setDate(maxDate.getDate() + escalationCfg.acceptedRiskMaxDays)
        if (new Date(expiresAt) > maxDate) {
          record.expiresAt = maxDate.toISOString()
          expiryWarning = `expiresAt clamped to maximum allowed value (${escalationCfg.acceptedRiskMaxDays} days)`
        } else {
          record.expiresAt = expiresAt
        }
      }

      addEscalation(record)

      return NextResponse.json({ success: true, record, ...(expiryWarning && { warning: expiryWarning }) })
    }

    addEscalation(record)

    return NextResponse.json({ success: true, record })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Escalation failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const project = getProject(id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const { escalationId } = body

    if (!escalationId) {
      return NextResponse.json({ error: 'escalationId is required' }, { status: 400 })
    }

    const removed = removeEscalation(escalationId)

    if (!removed) {
      return NextResponse.json({ error: 'Escalation not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
