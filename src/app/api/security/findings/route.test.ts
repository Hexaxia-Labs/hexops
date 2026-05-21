import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/config', () => ({
  getProjects: vi.fn().mockReturnValue([
    { id: 'proj-a', name: 'proj-a', path: '/a' },
    { id: 'proj-b', name: 'proj-b', path: '/b' },
  ]),
}));
vi.mock('@/lib/security/persistence', () => ({
  readSecurityCache: vi.fn().mockReturnValue(null),
}));

import { GET } from './route';

describe('GET /api/security/findings', () => {
  it('returns all projects when no ?project filter', async () => {
    const req = new NextRequest('http://localhost/api/security/findings');
    const res = await GET(req);
    const data = await res.json();
    expect(data.projects).toHaveLength(2);
  });

  it('returns only the matching project when ?project=proj-a', async () => {
    const req = new NextRequest('http://localhost/api/security/findings?project=proj-a');
    const res = await GET(req);
    const data = await res.json();
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].projectId).toBe('proj-a');
  });

  it('returns empty array when ?project= matches no project', async () => {
    const req = new NextRequest('http://localhost/api/security/findings?project=nonexistent');
    const res = await GET(req);
    const data = await res.json();
    expect(data.projects).toHaveLength(0);
  });
});
