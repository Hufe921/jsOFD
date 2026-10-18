# OFD SES V4 电子签章 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将实验性自签自验代码重写为支持 SES V4、X.509 信任链、多次签章和可见印章的 OFD 电子签章能力，并完成数科/福昕互操作验收。

**Architecture:** `asn1js` 负责严格 DER；独立 SM2/X.509 层负责数学验签与证书链；外部 signer 接口负责生产私钥。OFD 层只负责包、XML、逐文件摘要、SES 封装和验签报告，签名与信任判断分离。

**Tech Stack:** TypeScript 6、Vitest 5、asn1js 3.1.0、现有 SM2/SM3、GB/T 33190-2016、GB/T 38540-2020、GM/T 0099-2020。

设计依据：`docs/plans/2026-10-17-ofd-ses-signature-design.md`。除提交步骤外，每个任务都必须完成并通过测试后再进入下一任务；真实私钥和证书不得写入仓库。

---

### Task 1: 引入严格 DER 基础设施

**Files:**
- Modify: `packages/core/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/core/src/crypto/der.ts`
- Test: `packages/core/tests/der.test.ts`

**Step 1: 写失败测试**

覆盖：合法 DER 往返、尾随字节拒绝、非最短长度拒绝、超长输入拒绝、必填 SEQUENCE 子项数量检查。

```ts
import { describe, expect, it } from 'vitest';
import { derSequence, parseDer, readSequence } from '../src/crypto/der';

it('拒绝尾随垃圾和非最短长度', () => {
  const encoded = derSequence([]);
  expect(() => parseDer(new Uint8Array([...encoded, 0]))).toThrow(/trailing/i);
  expect(() => parseDer(new Uint8Array([0x30, 0x81, 0x00]))).toThrow(/DER|length/i);
});
```

**Step 2: 运行并确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/der.test.ts`
Expected: FAIL，模块不存在。

**Step 3: 安装依赖并实现最小 DER 包装**

Run: `pnpm --filter @hufe921/jsofd add asn1js@3.1.0`

实现固定导出：

```ts
export interface DerLimits { maxBytes: number; maxDepth: number; maxElements: number }
export const DEFAULT_DER_LIMITS: DerLimits = { maxBytes: 16 * 1024 * 1024, maxDepth: 32, maxElements: 10000 };
export function parseDer(bytes: Uint8Array, limits?: Partial<DerLimits>): asn1js.BaseBlock;
export function readSequence(block: asn1js.BaseBlock, min: number, max?: number): asn1js.Sequence;
export function derSequence(items: asn1js.BaseBlock[]): Uint8Array;
export function expectDerReencode(block: asn1js.BaseBlock, original: Uint8Array): void;
```

所有解析入口检查 `lenBlock`、原始长度、重编码一致性和资源上限；不对外暴露 asn1js 类型到公共 API。

**Step 4: 测试与静态检查**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/der.test.ts && pnpm --filter @hufe921/jsofd typecheck`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/core/package.json packages/core/src/crypto/der.ts packages/core/tests/der.test.ts pnpm-lock.yaml
git commit -m "feat: add strict DER handling for OFD signatures"
```

---

### Task 2: 修复 SM2/SM3 边界与签名编码

**Files:**
- Modify: `packages/core/src/crypto/sm2.ts`
- Modify: `packages/core/src/crypto/sm3.ts`
- Create: `packages/core/src/crypto/base64.ts`
- Test: `packages/core/tests/crypto.test.ts`
- Test: `packages/core/tests/crypto-boundary.test.ts`

**Step 1: 写边界失败测试**

至少覆盖：`d = 0`、`d = N - 1`、`d = N`、`k = 0`、`k = N`、`k > N`、64/65/66 字节公钥、短签名、非法点、非法 hex；SM2 DER `SEQUENCE(INTEGER r, INTEGER s)` 与 64 字节 `r||s` 双向转换。

```ts
expect(() => sm2SignWithK(key, msg, 0n)).toThrow(/nonce|range/i);
expect(() => sm2SignWithK(key, msg, N)).toThrow(/nonce|range/i);
expect(() => sm2Sign(nMinusOne, msg)).toThrow(/private key/i);
expect(sm2Verify(new Uint8Array(65), msg, new Uint8Array(1))).toBe(false);
```

**Step 2: 确认测试按预期失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/crypto-boundary.test.ts`
Expected: 新边界测试 FAIL。

**Step 3: 最小修复**

- `randomScalar` 使用拒绝采样，私钥范围为 `[1, N - 2]`；nonce 为 `[1, N - 1]`。
- `sm2SignWithK` 显式检查 `d` 和 `k`，不再可能因 `1 + d ≡ 0 (mod N)` 无限循环。
- 公钥只接受规范 65 字节 `04 || X || Y`，签名只接受 64 字节或规范 DER；`za` 使用同一规范化公钥。
- `hexToBytes` 拒绝非 hex 字符；新增无平台依赖的 Base64 编解码供 OFD `CheckValue` 使用。

**Step 4: 跑密码测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/crypto.test.ts tests/crypto-boundary.test.ts`
Expected: 原标准向量、sm-crypto 互验和新增边界全部 PASS。

**Step 5: Commit**

```bash
git add packages/core/src/crypto packages/core/tests/crypto*.test.ts
git commit -m "fix: harden SM2 boundaries and signature encodings"
```

---

### Task 3: 实现 X.509 SM2 解析与信任链

**Files:**
- Create: `packages/core/src/crypto/x509-sm2.ts`
- Create: `packages/core/src/crypto/revocation.ts`
- Create: `packages/core/tests/helpers/test-ca.ts`
- Test: `packages/core/tests/x509-sm2.test.ts`

**Step 1: 写失败测试**

测试 CA 动态生成 Root → Intermediate → Leaf，覆盖：可信链、错误根、过期、非 CA 签发者、pathLen、Key Usage、未知关键扩展、被吊销、吊销未知、证书签名被篡改。

公共结果形状：

```ts
interface CertificateTrustResult {
  status: 'trusted' | 'untrusted' | 'expired' | 'revoked' | 'indeterminate';
  chain: string[];
  reasons: string[];
}
```

**Step 2: 确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/x509-sm2.test.ts`
Expected: FAIL，API 不存在。

**Step 3: 实现 X.509 与吊销接口**

```ts
export interface RevocationProvider {
  check(certificate: Uint8Array, issuer: Uint8Array, at: Date): Promise<'good' | 'revoked' | 'unknown'>;
}
export interface VerifyCertificateOptions {
  trustAnchors: Uint8Array[];
  intermediates?: Uint8Array[];
  at?: Date;
  revocationProvider?: RevocationProvider;
  requireRevocation?: boolean;
}
export function parseSm2Certificate(der: Uint8Array): Sm2X509Certificate;
export function verifySm2CertificateSignature(cert: Uint8Array, issuer: Uint8Array): boolean;
export async function verifyCertificateChain(cert: Uint8Array, options: VerifyCertificateOptions): Promise<CertificateTrustResult>;
```

只接受标准 X.509 字段，不保留旧的简化自签 DER 生成器作为生产路径。测试 CA 序列号独立随机，证书用途按制章/签章区分。

**Step 4: 跑测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/x509-sm2.test.ts`
Expected: 全部 PASS，错误根不能因包内公钥数学验签成功而变为 trusted。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/x509-sm2.ts packages/core/src/crypto/revocation.ts packages/core/tests
git commit -m "feat: add SM2 X509 trust validation"
```

---

### Task 4: 实现 SES V4 DER 对象

**Files:**
- Create: `packages/core/src/crypto/ses-v4.ts`
- Create: `packages/core/tests/fixtures/ses-v4.ts`
- Test: `packages/core/tests/ses-v4.test.ts`

**Step 1: 写 SES 结构失败测试**

用 OFDRW/标准样例的 DER 十六进制作为 golden fixture，验证逐字节解析与重编码；覆盖 `SESeal`、`SES_SealInfo`、`TBS_Sign`、`SES_Signature`、图片信息、可选扩展和 `[0]` 时间戳。

```ts
const seal = parseSesSeal(SES_V4_SEAL_DER);
expect(seal.header.version).toBe(4);
expect(encodeSesSeal(seal)).toEqual(SES_V4_SEAL_DER);
expect(() => parseSesSignature(new Uint8Array([0x30, 0x00]))).toThrow(/SES|field/i);
```

**Step 2: 确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ses-v4.test.ts`
Expected: FAIL。

**Step 3: 实现最小完整 SES 映射**

固定结构：

```text
SESeal ::= SEQUENCE { eSealInfo, cert OCTET STRING, signAlgID OID, signedValue BIT STRING }
TBS_Sign ::= SEQUENCE { version INTEGER, eseal SESeal, timeInfo GeneralizedTime,
                        dataHash BIT STRING, propertyInfo IA5String, extDatas [0] OPTIONAL }
SES_Signature ::= SEQUENCE { toSign TBS_Sign, cert OCTET STRING, signatureAlgID OID,
                             signature BIT STRING, timeStamp [0] BIT STRING OPTIONAL }
```

同时实现 V4 印章头、属性、图片类型/数据、宽高和扩展数据；保留原始 DER 子字段供签名验证，禁止解析后重序列化 TBS 再验签。

**Step 4: 跑 golden 与畸形输入测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ses-v4.test.ts tests/der.test.ts`
Expected: golden 逐字节一致，截断/错标签/尾随数据均拒绝。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/ses-v4.ts packages/core/tests/ses-v4.test.ts packages/core/tests/fixtures/ses-v4.ts
git commit -m "feat: implement SES V4 DER structures"
```

---

### Task 5: 外部签名接口与本地测试签名器

**Files:**
- Create: `packages/core/src/crypto/signer.ts`
- Modify: `packages/core/src/crypto/ofd-sign.ts`
- Test: `packages/core/tests/signer.test.ts`

**Step 1: 写失败测试**

 fake signer 记录收到的字节，断言收到的是原始 TBS DER 而非摘要；验证异步错误、超时和 DER 签名格式错误会失败。

```ts
export interface Sm2Signer {
  sign(request: { tbs: Uint8Array; certificate: Uint8Array; userId?: string; signal?: AbortSignal }): Promise<Uint8Array>;
}
export function createLocalTestSm2Signer(privateKey: Uint8Array, userId?: string): Sm2Signer;
```

**Step 2: 确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/signer.test.ts`
Expected: FAIL。

**Step 3: 实现接口与测试适配器**

生产接口只传 `tbs`、证书和可选 UserID；本地适配器显式命名为 `createLocalTestSm2Signer`，文档标明不得用于生产密钥。删除 `cert.privateKey!` 非空断言和隐式自签证书默认行为。

**Step 4: 跑测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/signer.test.ts tests/crypto.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/signer.ts packages/core/src/crypto/ofd-sign.ts packages/core/tests/signer.test.ts
git commit -m "feat: add external SM2 signer interface"
```

---

### Task 6: 制章、验章与印章图片

**Files:**
- Create: `packages/core/src/crypto/ofd-seal.ts`
- Test: `packages/core/tests/ofd-seal.test.ts`

**Step 1: 写失败测试**

覆盖：制章者签名生成 eSeal、制章者证书不匹配、印章过期、图片提取、篡改 `eSealInfo`、未知关键扩展、真实信任链与不受信链分离。

```ts
const seal = await createSesSeal({ info, makerCertificate, signer: makerSigner });
const result = await verifySesSeal(seal, { trustAnchors, at: new Date('2026-10-17T00:00:00Z') });
expect(result.signatureValid).toBe(true);
expect(result.picture.data).toEqual(png);
```

**Step 2: 确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ofd-seal.test.ts`
Expected: FAIL。

**Step 3: 实现制章与验章**

- 对原始 `eSealInfo` DER 调用制章 signer；`signedValue` 保存 DER SM2 签名。
- 验章使用保存的原始 TBS 字节、制章证书和 SM2 UserID 策略。
- 独立返回 `signatureValid`、`trust`、`validity` 和 `reasons`；图片只来自 `eSealInfo.picture`。

**Step 4: 跑测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ofd-seal.test.ts tests/ses-v4.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/ofd-seal.ts packages/core/tests/ofd-seal.test.ts
git commit -m "feat: create and verify SES electronic seals"
```

---

### Task 7: 安全的 OFD 签名包与 XML 操作

**Files:**
- Create: `packages/core/src/crypto/ofd-package.ts`
- Create: `packages/core/src/crypto/ofd-signature-xml.ts`
- Modify: `packages/core/src/zip-read.ts`
- Test: `packages/core/tests/ofd-package.test.ts`

**Step 1: 写失败测试**

覆盖：路径穿越、绝对路径归一化、重复 ZIP 条目、大小限制、多 DocBody、`ofd:` 与默认命名空间、已有 `Signatures` 入口、特殊字符转义、非法页 ID 和 StampAnnot。

XML 生成形状：

```xml
<ofd:Signatures xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Signature ID="s001" Type="Seal" BaseLoc="/Signs/Sign_0/Signature.xml"/>
  <ofd:MaxSignId>s002</ofd:MaxSignId>
</ofd:Signatures>
```

```xml
<ofd:References CheckMethod="1.2.156.10197.1.401">
  <ofd:Reference FileRef="/OFD.xml"><ofd:CheckValue>base64(sm3)</ofd:CheckValue></ofd:Reference>
</ofd:References>
```

**Step 2: 确认失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ofd-package.test.ts`
Expected: FAIL。

**Step 3: 实现包和 XML 层**

提供：

```ts
export function resolveOfdPath(baseFile: string, loc: string): string;
export function selectDocBody(entries: Map<string, Uint8Array>, index?: number): OfdDocBody;
export function collectProtectedEntries(entries: Map<string, Uint8Array>, signaturesLoc: string, allowAdditional: boolean): ProtectedEntry[];
export function buildSignatureXml(input: SignatureXmlInput): Uint8Array;
export function updateSignatureList(input: SignatureListInput): UpdateResult;
```

首次签章先修改 `OFD.xml` 再计算其摘要；后续只更新签名列表。允许后续签章时仅排除签名列表，旧 `Sign_N` 全部保留并纳入保护。完整保护模式包含签名列表，后续签章必须拒绝。

**Step 4: 跑测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/ofd-package.test.ts tests/zip.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/ofd-package.ts packages/core/src/crypto/ofd-signature-xml.ts packages/core/src/zip-read.ts packages/core/tests/ofd-package.test.ts
git commit -m "feat: add safe OFD signature package handling"
```

---

### Task 8: 重写 signOfd 为 SES V4 多次签章

**Files:**
- Modify: `packages/core/src/crypto/ofd-sign.ts`
- Test: `packages/core/tests/sign.test.ts`
- Test: `packages/core/tests/sign-multi.test.ts`

**Step 1: 写失败测试**

断言生成物包含：

```text
OFD.xml（仅首次修改）
Signs/Signatures.xml
Signs/Sign_0/Signature.xml
Signs/Sign_0/Seal.esl
Signs/Sign_0/SignedValue.dat
Signs/Sign_1/...（第二次签章）
```

检查 References 逐文件 SM3、SES `dataHash = SM3(Signature.xml)`、`Seal.esl` 等于输入 eSeal、StampAnnot 页面/Boundary/ID 正确、旧签章字节不变。

**Step 2: 确认旧实现失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/sign.test.ts tests/sign-multi.test.ts`
Expected: 旧 129 字节格式 FAIL。

**Step 3: 重写签章编排**

公共输入：

```ts
export interface SignOfdOptions {
  eSeal: Uint8Array;
  signingCertificate: Uint8Array;
  signer: Sm2Signer;
  stamp?: { page: number; x: number; y: number; w: number; h: number; clip?: string };
  allowAdditionalSignatures?: boolean;
  docBodyIndex?: number;
  provider?: { name: string; company?: string; version?: string };
  now?: () => Date;
  signal?: AbortSignal;
}
```

严格按“包预检 → 修改入口 → 保护列表 → Signature.xml → SES TBS → 外部签章 → 写 Seal.esl/SignedValue.dat → 更新列表 → 重打包”执行。删除 `SignedValue = r||s||publicKey`、`Certificate.der`、空 `sealImage` 分支和旧 `cmsParse`。

**Step 4: 跑签章测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/sign.test.ts tests/sign-multi.test.ts`
Expected: 单次/多次签章、命名空间和 XML 特殊字符全部 PASS。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/ofd-sign.ts packages/core/tests/sign*.test.ts
git commit -m "feat: generate standard SES V4 OFD signatures"
```

---

### Task 9: 重写 verifyOfd 与抗恶意重签

**Files:**
- Create: `packages/core/src/crypto/ofd-verify.ts`
- Modify: `packages/core/src/crypto/ofd-sign.ts`
- Test: `packages/core/tests/verify.test.ts`
- Test: `packages/core/tests/verify-attacks.test.ts`

**Step 1: 写失败测试**

覆盖：正文篡改、Signature.xml 篡改、Seal.esl 篡改、SignedValue 替换、攻击者自有密钥整体重签、错误信任根、证书过期/吊销、后续合法签章、畸形 ZIP/XML/DER、未知关键扩展。

```ts
const report = await verifyOfd(attackerResigned, { trustAnchors: [victimRoot] });
expect(report.signatures[0].status).toBe('untrusted');
expect(report.signatures[0].signatureValid).toBe(true); // 数学有效但不属于受信签章者
```

**Step 2: 确认旧验签失败**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/verify-attacks.test.ts`
Expected: 旧实现对恶意重签错误地返回 valid。

**Step 3: 实现分层验签报告**

```ts
type SignatureStatus = 'valid' | 'invalid' | 'untrusted' | 'indeterminate';
interface OfdSignatureVerification {
  id: string;
  referencesValid: boolean;
  signatureValid: boolean;
  sealSignatureValid: boolean;
  signerTrust: CertificateTrustResult;
  makerTrust: CertificateTrustResult;
  status: SignatureStatus;
  reasons: string[];
}
interface OfdVerifyResult { signatures: OfdSignatureVerification[]; errors: string[] }
```

验证所有签名，不取第一个后返回。只有 References、SES 两级签名、时间、证书链、信任与策略要求的吊销检查全部满足时状态为 `valid`。输入畸形进入 `errors` 或对应签名报告。

**Step 4: 跑全部安全测试**

Run: `pnpm --filter @hufe921/jsofd exec vitest run tests/verify.test.ts tests/verify-attacks.test.ts tests/sign-multi.test.ts`
Expected: 恶意重签不能成为 valid，合法两次签章均通过。

**Step 5: Commit**

```bash
git add packages/core/src/crypto/ofd-verify.ts packages/core/src/crypto/ofd-sign.ts packages/core/tests/verify*.test.ts
git commit -m "fix: verify SES signatures with explicit trust"
```

---

### Task 10: 公共 API、文档与清理

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/crypto/ofd-sign.ts`
- Modify: `packages/core/package.json`
- Modify: `README.md`
- Modify: `docs/guide/advanced.md`
- Create: `docs/guide/signatures.md`
- Modify: `docs/.vitepress/config.ts`
- Modify: `docs/guide/ofd-reader.md`

**Step 1: 写公共导入失败测试**

```ts
import { signOfd, verifyOfd, createSesSeal, createLocalTestSm2Signer } from '@hufe921/jsofd';
```

在 `packages/core/tests/package.test.ts` 检查导出和构建类型声明；明确本地 signer 的测试用途。

**Step 2: 确认失败并完成导出**

导出签名、验签、制章、 signer/报告类型；不导出内部 ASN.1 和 DER 辅助类型。更新包 `exports`（如采用 `./sign` 子路径则同步 tsup 与类型声明）。

**Step 3: 更新文档**

包含完整 SES 示例、外部 signer 示例、信任链/吊销示例、多次签章行为、可见印章来源和安全注意事项；删除 CMS 注释和“自签证书默认可信”等旧描述。

**Step 4: 全量验证**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm docs:build`
Expected: 全部 PASS，无旧 129 字节格式或 `cmsParse` 残留。

**Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/package.json README.md docs packages/core/tests/package.test.ts
git commit -m "docs: document production SES signature integration"
```

---

### Task 11: 数科与福昕真实材料互操作验收

**Files:**
- Create: `packages/core/tests/manual/ses-interop.ts`
- Modify: `.gitignore`（仅在本地输出目录确有必要时）
- Modify: `docs/guide/signatures.md`

**Step 1: 编写手工联调脚本**

从 `JSOFD_SES_TEST_DIR` 读取两套证书链、私钥句柄/外部 signer 配置和印章材料；默认输出到系统临时目录。仓库中只保存脚本，不保存真实材料。

**Step 2: 自动前置检查**

Run: `JSOFD_SES_TEST_DIR=/secure/local/path pnpm --filter @hufe921/jsofd exec tsx tests/manual/ses-interop.ts`
Expected: 生成单次签章、两次签章和篡改样本；本地 `verifyOfd` 对合法样本为 valid，篡改为 invalid。

**Step 3: 数科验收**

逐一确认：印章图片、位置、签章者/制章者证书链、签名有效、两次签章均保留、篡改样本失败。记录阅读器版本和结果，不记录私钥。

**Step 4: 福昕验收**

重复 Step 3。若厂商要求兼容写法，先在标准允许范围内修正，并补充对应 golden 测试，不能通过关闭信任检查换取通过。

**Step 5: 最终回归**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm docs:build`
Expected: 全部 PASS；外部验收结果补齐后方可宣称生产互操作完成。

**Step 6: Commit**

```bash
git add packages/core/tests/manual/ses-interop.ts docs/guide/signatures.md .gitignore
git commit -m "test: add external SES interoperability harness"
```
