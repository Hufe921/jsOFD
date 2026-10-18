import { sm2Sign, sm2SignatureFromDer, sm2SignatureToDer } from './sm2';

export interface Sm2SignRequest {
  tbs: Uint8Array;
  certificate: Uint8Array;
  userId?: string;
  signal?: AbortSignal;
}

export interface Sm2Signer {
  sign(request: Sm2SignRequest): Promise<Uint8Array>;
}

function abortError(): Error {
  const error = new Error('SM2 signing was aborted');
  error.name = 'AbortError';
  return error;
}

export async function requestSm2Signature(
  signer: Sm2Signer,
  request: Sm2SignRequest,
  timeoutMs = 30000,
): Promise<Uint8Array> {
  if (request.signal?.aborted) throw abortError();
  const controller = new AbortController();
  const onAbort = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = signer.sign({ ...request, signal: controller.signal });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`SM2 signing timed out after ${timeoutMs}ms`));
        controller.abort();
      }, timeoutMs);
    });
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(abortError()), { once: true });
    });
    const signature = await Promise.race([work, timeout, aborted]);
    sm2SignatureFromDer(signature);
    return signature;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
  }
}

/** Test-only adapter. Production private keys should remain in a UKey, KMS, HSM, or signing service. */
export function createLocalTestSm2Signer(privateKey: Uint8Array, userId?: string): Sm2Signer {
  const key = privateKey.slice();
  return {
    async sign(request) {
      if (request.signal?.aborted) throw abortError();
      return sm2SignatureToDer(sm2Sign(key, request.tbs, request.userId ?? userId));
    },
  };
}
