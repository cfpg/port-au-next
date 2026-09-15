import { describe, expect, it } from 'vitest';
import { generateBucketName, generateMinioPolicyName } from './bucket';

describe('generateBucketName', () => {
  it('uses the production suffix by default', () => {
    expect(generateBucketName('DelayMX')).toBe('delaymx-bucket');
    expect(generateBucketName('DelayMX', false)).toBe('delaymx-bucket');
  });

  it('uses a distinct shared-preview suffix', () => {
    expect(generateBucketName('DelayMX', true)).toBe('delaymx-preview-bucket');
  });
});

describe('generateMinioPolicyName', () => {
  it('keeps production and preview policies distinct', () => {
    expect(generateMinioPolicyName('DelayMX')).toBe('delaymx-policy');
    expect(generateMinioPolicyName('DelayMX', true)).toBe('delaymx-preview-policy');
  });
});
