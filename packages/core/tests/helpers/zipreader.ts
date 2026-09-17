/**
 * 测试辅助：极简 STORE 型 ZIP 读取器（jsOFD 产出的就是存储式 ZIP）
 */

export function readZip(u8: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let pos = 0;

  while (pos + 4 <= u8.length) {
    const sig = dv.getUint32(pos, true);
    if (sig !== 0x04034b50) break; // 到达中央目录

    const method = dv.getUint16(pos + 8, true);
    if (method !== 0) throw new Error('测试读取器仅支持 STORE 条目');

    const csize = dv.getUint32(pos + 18, true);
    const nameLen = dv.getUint16(pos + 26, true);
    const extraLen = dv.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const name = new TextDecoder().decode(u8.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;

    files.set(name, u8.slice(dataStart, dataStart + csize));
    pos = dataStart + csize;
  }
  return files;
}

export function text(files: Map<string, Uint8Array>, name: string): string {
  const d = files.get(name);
  if (!d) throw new Error(`ZIP 中不存在条目: ${name}（现有: ${[...files.keys()].join(', ')}）`);
  return new TextDecoder().decode(d);
}
