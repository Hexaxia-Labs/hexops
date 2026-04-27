import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface VercelProject {
  projectId: string;
  orgId: string;
}

interface VercelDeployment {
  url: string;
  state: string;
  created: string;
  target?: string;
  uid?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const history = new URL(request.url).searchParams.get('history') === '1';
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const cwd = project.path;

    // Check if this is a Vercel project
    const vercelDir = join(cwd, '.vercel');
    const vercelJson = join(cwd, 'vercel.json');
    const projectJson = join(vercelDir, 'project.json');

    let isVercelProject = false;
    let vercelProjectInfo: VercelProject | null = null;

    // Check for .vercel/project.json (linked project)
    try {
      await access(projectJson);
      const content = await readFile(projectJson, 'utf-8');
      vercelProjectInfo = JSON.parse(content);
      isVercelProject = true;
    } catch {
      // Not linked yet, check for vercel.json
      try {
        await access(vercelJson);
        isVercelProject = true;
      } catch {
        // No Vercel config found
      }
    }

    if (!isVercelProject) {
      return NextResponse.json({
        isVercelProject: false,
        isLinked: false,
        projectInfo: null,
        latestDeployment: null,
      });
    }

    // Fetch deployment list via vercel CLI
    let latestDeployment: VercelDeployment | null = null;
    let deploymentHistory: VercelDeployment[] = [];
    try {
      const limit = history ? 10 : 1;
      const { stdout } = await execAsync(`vercel ls --json 2>/dev/null | head -${limit}`, {
        cwd,
        timeout: 10000,
      });

      if (stdout.trim()) {
        const jsonStart = stdout.search(/[\[{]/);
        const jsonOutput = jsonStart >= 0 ? stdout.slice(jsonStart) : '[]';
        const deployments = JSON.parse(jsonOutput);
        if (Array.isArray(deployments) && deployments.length > 0) {
          const normalize = (d: Record<string, unknown>): VercelDeployment => ({
            uid: d.uid as string | undefined,
            url: (d.url || (Array.isArray(d.alias) ? d.alias[0] : undefined)) as string,
            state: (d.state || d.readyState) as string,
            created: (d.created || d.createdAt) as string,
            target: d.target as string | undefined,
          });
          latestDeployment = normalize(deployments[0] as Record<string, unknown>);
          if (history) deploymentHistory = deployments.map(normalize);
        }
      }
    } catch {
      // Vercel CLI not available or not authenticated
    }

    return NextResponse.json({
      isVercelProject: true,
      isLinked: vercelProjectInfo !== null,
      projectInfo: vercelProjectInfo,
      latestDeployment,
      ...(history && { deploymentHistory }),
    });
  } catch (error) {
    console.error('Error checking Vercel status:', error);
    return NextResponse.json(
      { error: 'Failed to check Vercel status' },
      { status: 500 }
    );
  }
}

// Deploy to Vercel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const isProd = body.production === true;

    const cwd = project.path;

    // Run vercel deploy
    const command = isProd ? 'vercel --prod --yes' : 'vercel --yes';

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: 300000, // 5 minute timeout for deploys
      });

      // Extract deployment URL from output
      const urlMatch = (stdout + stderr).match(/https:\/\/[^\s]+\.vercel\.app/);
      const deploymentUrl = urlMatch ? urlMatch[0] : null;

      return NextResponse.json({
        success: true,
        output: stdout || stderr,
        deploymentUrl,
        production: isProd,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed';
      return NextResponse.json(
        { error: message, success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error deploying to Vercel:', error);
    return NextResponse.json(
      { error: 'Failed to deploy' },
      { status: 500 }
    );
  }
}
