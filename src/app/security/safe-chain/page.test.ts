import { describe, it, expect } from 'vitest';
import SafeChainPage from './page';

describe('SafeChainPage', () => {
  it('exports a default function component', () => {
    expect(typeof SafeChainPage).toBe('function');
  });
});
