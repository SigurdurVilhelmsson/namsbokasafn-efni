/**
 * Example test file demonstrating the testing infrastructure.
 *
 * Run tests with:
 *   npm test                 # Run all tests once
 *   npm run test:watch       # Watch mode
 *   npm run test:coverage    # With coverage report
 */

import { describe, it, expect } from 'vitest';

describe('Testing Infrastructure', () => {
  it('should run vitest tests correctly', () => {
    expect(true).toBe(true);
  });

  it('should support basic assertions', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
    expect(result).toBeGreaterThan(3);
    expect(result).toBeLessThan(5);
  });

  it('should support string assertions', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
    expect(greeting).toMatch(/Hello/);
  });

  it('should support object assertions', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('test');
    expect(obj).toEqual({ name: 'test', value: 42 });
  });
});

describe('Async Operations', () => {
  it('should handle async/await', async () => {
    const fetchData = () => Promise.resolve({ data: 'test' });
    const result = await fetchData();
    expect(result.data).toBe('test');
  });

  it('should handle promises', () => {
    return Promise.resolve('success').then((result) => {
      expect(result).toBe('success');
    });
  });
});
