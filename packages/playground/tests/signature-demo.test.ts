import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SES signature playground demo', () => {
  const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
  const app = readFileSync(join(__dirname, '../src/app.ts'), 'utf8');

  it('uses signature actions instead of the password-encryption panel', () => {
    expect(html).toContain('签章演示');
    expect(html).toContain('id="signCurrent"');
    expect(html).toContain('id="verifySigned"');
    expect(html).toContain('id="tamperSigned"');
    expect(html).not.toContain('id="encryptCurrent"');
    expect(html).not.toContain('id="cryptoPassword"');
  });

  it('wires SES signing, trusted verification, and tampering', () => {
    expect(app).toContain('signOfd');
    expect(app).toContain('verifyOfd');
    expect(app).toContain('createSesTestMaterial');
    expect(app).toContain('tamperSignedDemo');
    expect(app).not.toContain('encryptOfdPassword');
    expect(app).not.toContain('decryptOfdPassword');
  });
});
