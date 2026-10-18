declare module 'sm-crypto' {
  const smCrypto: {
    sm4: {
      encrypt(
        data: Uint8Array,
        key: Uint8Array,
        options: { mode: 'cbc'; iv: Uint8Array; padding: 'none'; output: 'array' },
      ): number[];
      decrypt(
        data: Uint8Array,
        key: Uint8Array,
        options: { mode: 'cbc'; iv: Uint8Array; padding: 'none'; output: 'array' },
      ): number[];
    };
  };
  export default smCrypto;
}
