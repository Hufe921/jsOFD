# OFD 口令加密与解密

jsOFD 按 GM/T 0099-2020 附录 C 实现口令加密：包内文件使用随机 16 字节 FEK 和 IV 做 **SM4-CBC/PKCS#7** 加密，口令经 **SM3-KDF** 派生密钥包装 FEK。加密与电子签章是不同能力：加密后没有正确口令无法还原正文。

## 加密

```ts
import { encryptOfdPassword } from '@hufe921/jsofd';

const encrypted = await encryptOfdPassword(ofdBytes, {
  userName: 'demo',
  password: '12345678',
});
```

默认加密全部包内文件并删除对应明文。也可以按路径局部加密：

```ts
const encrypted = await encryptOfdPassword(ofdBytes, {
  userName: 'demo',
  password: '12345678',
  filter: (name) => name.startsWith('Doc_0/Pages/Page_0/'),
});
```

局部加密应把页面内容、注释、模板及其引用资源一起纳入，否则解密端可能无法正确渲染。

生成物包含：

- `Encryptions.xml`：解密入口、加密范围和密钥文件位置；
- `decryptseed.dat`：口令方案 `1.1.1`、用户信息、包装后的 FEK 和 IV；
- `entriesmap.dat`：加密后的明密文路径映射；
- 各包内密文 `.dat` 文件。

## 解密

```ts
import { decryptOfdPassword } from '@hufe921/jsofd';

const plainBytes = await decryptOfdPassword(encrypted, {
  userName: 'demo',
  password: '12345678',
});
```

解密会还原映射中的明文路径和内容。口令错误、密文被篡改或 PKCS#7 填充损坏时会抛出异常，不会返回部分明文。

当前范围是单次口令加密操作；证书加密（方案 `1.1.2`）和多重加密不在此 API 内。生产系统应通过安全通道传递口令，不要在代码、日志或分享链接中硬编码真实口令。
