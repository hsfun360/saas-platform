import { describe, expect, it } from 'vitest';
import tinymcePackage from 'tinymce/package.json';
import { TINYMCE_VERSION } from './email-html-editor';

// /tinymce is served by fixed file names, so the version in the cache-busting
// query string is the only thing that makes a browser fetch an upgraded copy.
// Keep the constant in lock-step with the installed package.
describe('TINYMCE_VERSION', () => {
  it('matches the installed tinymce package', () => {
    expect(TINYMCE_VERSION).toBe(tinymcePackage.version);
  });
});
