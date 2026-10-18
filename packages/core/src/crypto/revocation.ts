export type RevocationStatus = 'good' | 'revoked' | 'unknown';

export interface RevocationProvider {
  check(
    certificate: Uint8Array,
    issuer: Uint8Array,
    at: Date,
  ): Promise<RevocationStatus>;
}
