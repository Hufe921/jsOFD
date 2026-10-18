# OFD SES 电子签章修复设计

日期：2026-10-17

## 目标

将当前实验性的自签自验实现重写为可用于生产集成的 OFD SES 电子签章功能，目标标准：

- GB/T 33190-2016 第 18 章：OFD 签名列表、签名描述、保护范围与签名外观。
- GM/T 0099-2020：OFD 密码应用流程。
- GB/T 38540-2020：SES V4 电子印章与电子签章数据结构。
- GB/T 20518、GB/T 32918、GB/T 32905：X.509、SM2 与 SM3。

不包含 OFD 内容加密/解密；那是独立需求。

## 验收目标

1. 新签章在数科和福昕 OFD 阅读器中显示可见印章，并通过结构、签名和证书检查。
2. 使用真实制章者、签章者两套 SM2 证书链完成联调；私钥不进入仓库。
3. 支持保留已有签章的多次签章，旧签章不因新增签章而失效。
4. 验签区分文件完整性、SES 两级签名、证书链、信任与吊销状态，不信任包内自报公钥。
5. 全部单元测试、类型检查、lint 和构建通过。

## 架构

### `crypto/ses-v4.ts`

使用 `asn1js` 编解码 SES V4 DER 结构，包括 `SESeal`、`SES_Signature`、`TBS_Sign`、印章信息和图片信息。严格检查标签、长度、必需字段、DER 编码和输入大小，不再使用线性字节扫描。

支持两种输入：

- 已有标准 `SESeal` DER；
- 制章材料与外部制章签名接口，由库生成 `SESeal`。

### `crypto/x509-sm2.ts`

解析标准 X.509 证书并执行：

- SM2 证书签名验证；
- 有效期、Basic Constraints、Key Usage 检查；
- 未知关键扩展拒绝；
- 信任链构建与受信根匹配；
- CRL/OCSP 通过 `RevocationProvider` 接口接入。

信任锚必须由调用方提供。证书链和吊销检查结果是独立状态，不以数学验签通过代替身份可信。

### `crypto/signer.ts`

外部签名接口接收准确的 TBS DER 字节，返回 SM2 DER 签名值。生产私钥由 UKey、KMS、密码机或服务端管理，jsOFD 不读取生产私钥。

本地 SM2 签名器只用于测试和开发，并修复私钥、随机数和 nonce 边界检查。证书序列号不再从私钥派生。

### `crypto/ofd-seal.ts`

生成、解析和验证电子印章，提取标准印章图片用于 OFD 签名外观。制章签名与签章签名是两个独立步骤。

### `crypto/ofd-sign.ts` / `crypto/ofd-verify.ts`

负责 OFD 包处理、签名列表、逐文件保护范围、签名描述、SES 封装、印章外观和多次签章。

## 公共 API

签名：

```ts
const signed = await signOfd(bytes, {
  eSeal,
  signingCertificate,
  signer,
  stamp: { page: 1, x: 120, y: 240, w: 40, h: 40 },
  allowAdditionalSignatures: true,
});
```

验签：

```ts
const report = await verifyOfd(signed, {
  trustAnchors,
  intermediateCertificates,
  revocationProvider,
});
```

每个签章返回独立结果：

- 包结构与引用完整性；
- 受保护文件摘要；
- `Signature.xml` 摘要绑定；
- 制章签名与签章签名；
- 制章者、签章者证书链；
- 信任与吊销状态；
- 印章有效期和签章时间；
- 综合状态及机器可读原因码。

只有调用方策略要求的检查全部通过时，综合状态才为可信。

## 签章流程

1. 校验 ZIP、包内路径、重复条目、大小限制、OFD 主入口和签名权限。
2. 首次签章时在目标 `DocBody` 添加 `Signatures` 入口；后续签章不重复修改 `OFD.xml`。
3. 分配未使用的 `Sign_N`，保留所有已有签章文件。
4. 确定保护文件列表并逐个计算 SM3。允许继续签章时排除 `Signs/Signatures.xml`，不排除整个 `Signs/`；已有签章文件默认纳入新签章保护范围。
5. 按标准生成 `Signature.xml`，包含算法提供者、签名方法、时间、逐文件引用摘要、`SignedValue` 位置和 `StampAnnot` 外观。
6. 计算 `Signature.xml` 的 SM3，组装 SES `TBS_Sign`，通过签章者外部签名接口完成签名。
7. 写入 `SignedValue.dat` 和 `Seal.esl`，更新 `Signatures.xml` 后重新打包。

可见印章来自 SES 电子印章图片，不再忽略 `sealImage` 字节或写入无资源关联的空外观。

## 验签流程

1. 安全解析签名列表和每个签名描述，检查包内路径及引用合法性。
2. 按每个 `Reference` 重新计算文件摘要，检查文件缺失、篡改和重复引用。
3. 严格解析 SES DER，验证 `dataHash` 与 `Signature.xml` 的绑定。
4. 分别验证制章签名和签章签名。
5. 分别验证制章者与签章者证书链、有效期、用途、信任锚和吊销状态。
6. 校验印章有效期、签章时间及相关 SES 属性。
7. 返回每个签章的独立报告；不因第一个签章成功而忽略后续签章。

## 错误处理

- `signOfd` 对无效参数、无权限、结构不安全或外部签名失败抛出明确异常，不返回部分签章包。
- `verifyOfd` 对畸形 ZIP/XML/DER、缺失文件和不支持的关键扩展返回失败或不确定报告，不直接崩溃。
- 参数类型错误和信任策略配置错误可以抛异常。
- 不做静默降级；缺少信任锚或策略要求的吊销证据时不能报告为可信。

## 安全与资源限制

- ZIP 条目数、单条目和总解压大小、XML/DER 深度与长度均设上限。
- 拒绝绝对路径、路径穿越、重复包条目和不安全引用。
- XML 文本和属性统一转义，不依赖固定前缀或单一字符串模板处理外部文档。
- 外部签名和吊销接口设置超时与错误传播策略。
- 测试私钥仅由测试生成；真实私钥、证书链和印章材料通过本地未跟踪文件或环境变量提供。

## 测试与发布

单元与集成测试：

- SM2/SM3 标准向量及边界条件；
- SES V4 DER 标准样例、往返与畸形输入；
- X.509 信任链、有效期、用途、未知关键扩展、CRL/OCSP 状态；
- 受保护文件篡改和恶意整体重签；
- 多次签章与旧签章保持；
- 可见印章及页面引用；
- 不同 XML 命名空间前缀、异常 ZIP/XML/DER；
- 公共 API、类型检查、lint、构建和文档示例。

外部验收：

1. 使用两套真实测试证书链生成本地联调 OFD。
2. 在数科 OFD 中检查印章外观、签章、证书链和篡改结果。
3. 在福昕 OFD 中重复相同检查。
4. 真实材料及生成物不提交仓库；仓库测试使用自动生成的测试 CA。

## 参考

- [GB/T 33190-2016 标准文本](https://ghhzrzyj.sxjz.gov.cn/Upload/gtj/ContentManage/Article/File/2023/12/11/GB／T33190-2016电子文件存储与交换格式版式文档-已压缩(1).pdf)
- [GM/T 0099-2020 内容摘录](https://www.sohu.com/a/695887360_121649130)
- [OFDRW SES V4 容器参考实现](https://github.com/ofdrw/ofdrw/blob/master/ofdrw-sign/src/main/java/org/ofdrw/sign/signContainer/SESV4Container.java)
- [OFDRW 数字签名说明](https://github.com/ofdrw/ofdrw/blob/master/ofdrw-sign/README.md)
