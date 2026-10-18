# SES 电子签章与可信验签

jsOFD 支持 GB/T 38540-2020 SES V4 电子印章、OFD 多次签章、可见印章外观，以及基于显式信任锚的验签。电子签章用于证明身份和完整性，**不会加密正文**。

## 生产密钥接口

生产私钥不应进入浏览器或 jsOFD。实现 `Sm2Signer`，把准确的 TBS DER 字节交给 UKey、KMS、密码机或服务端：

```ts
import type { Sm2Signer } from '@hufe921/jsofd';

const signer: Sm2Signer = {
  async sign({ tbs, certificate, userId, signal }) {
    return signingService.signSm2Der({ tbs, certificate, userId, signal });
  },
};
```

`createLocalTestSm2Signer(privateKey)` 只用于本地测试，不应用于生产密钥。

## 生成电子印章

制章和签章是两级独立签名。下面用测试签名器演示接口形状：

```ts
import { createSesSeal, createLocalTestSm2Signer } from '@hufe921/jsofd';

const eSeal = await createSesSeal({
  info: {
    header: { id: 'ES', version: 4, vid: 'JSOFD' },
    esId: 'SEAL-001',
    property: {
      type: 1,
      name: '测试印章',
      certList: [makerCertificate],
      createDate: new Date('2026-01-01T00:00:00Z'),
      validStart: new Date('2026-01-01T00:00:00Z'),
      validEnd: new Date('2027-01-01T00:00:00Z'),
    },
    picture: { type: 'PNG', data: sealPng, width: 40, height: 40 },
  },
  makerCertificate,
  signer: makerSigner,
});
```

已有合规制章系统时，也可以直接传入其生成的标准 `SESeal` DER，无需重新制章。

## 签章

```ts
import { signOfd } from '@hufe921/jsofd';

const signedBytes = await signOfd(ofdBytes, {
  eSeal,
  signingCertificate,
  signer,
  stamp: { page: 1, x: 120, y: 240, w: 40, h: 40 },
});
```

生成的包包含 `Signatures.xml`、独立的 `Sign_N/Signature.xml`、`Seal.esl` 和 `SignedValue.dat`。印章图片取自 SES 电子印章，不是单独伪造的 PNG 外观。

默认允许继续签章，`Signatures.xml` 不进入本次保护列表，旧签章文件会保留。若 `allowAdditionalSignatures: false`，签名列表也纳入保护，之后不能再追加签章。

## 可信验签

验签必须显式提供受信根证书；包内公钥和证书本身不构成信任依据。

```ts
import { verifyOfd } from '@hufe921/jsofd';

const report = await verifyOfd(signedBytes, {
  trustAnchors: [rootCaDer],
  intermediateCertificates: [intermediateCaDer],
  revocationProvider: {
    async check(certificate, issuer, at) {
      return revocationService.status(certificate, issuer, at); // good | revoked | unknown
    },
  },
  requireRevocation: true,
});

for (const signature of report.signatures) {
  console.log(signature.status); // valid | invalid | untrusted | indeterminate
  console.log(signature.referencesValid, signature.signatureValid);
  console.log(signature.signerTrust.status, signature.makerTrust.status);
}
```

结果按每个签章分别返回：

- `referencesValid`：受保护包内文件的 SM3 是否全部匹配；
- `signatureValid`：`Signature.xml` 摘要绑定和签章者 SM2 签名是否正确；
- `sealSignatureValid`：制章者签名及 `Seal.esl` 绑定是否正确；
- `signerTrust` / `makerTrust`：两条证书链的信任结果；
- `status`：按当前信任和吊销策略得出的综合状态。

数学签名正确但证书不受信时，结果为 `untrusted`，不能当作有效签章。缺少策略要求的吊销证据时为 `indeterminate`，不会静默放行。

## 数科与福昕联调

仓库提供 `packages/core/tests/manual/ses-interop.test.ts`。在仓库外的安全目录放入：

- 共享或分别命名的 `root.der`、`intermediate.der`；也可使用 `maker-root.der`、`signer-root.der` 和对应 intermediate；
- `maker.der`、`signer.der`；
- 仅用于联调的 `maker-key.hex`、`signer-key.hex`（32 字节 SM2 私钥 hex）；
- `seal.png`。

然后运行：

```sh
JSOFD_SES_TEST_DIR=/secure/local/path pnpm --filter @hufe921/jsofd exec vitest run tests/manual/ses-interop.test.ts
```

脚本先在本地验证单次签章、两次签章和篡改样本，再把 `single.ofd`、`multiple.ofd`、`tampered.ofd` 写到系统临时目录，供数科和福昕检查。真实证书、私钥和生成物不要提交仓库。
