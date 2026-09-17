import { describe, expect, it } from 'vitest';
import { sniffImage } from '../src/image';
import { jsOFD } from '../src/jsofd';
import { b64Decode } from '../src/utils';
import { readZip, text } from './helpers/zipreader';

/** 构造最小 PNG 头（8B 签名 + IHDR w/h） */
function pngHeader(w: number, h: number): Uint8Array {
  const u8 = new Uint8Array(24);
  u8.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(u8.buffer);
  dv.setUint32(4, 13); // IHDR length
  u8.set([0x49, 0x48, 0x44, 0x52], 8); // "IHDR"
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return u8;
}

/** 1×1 红色 PNG（真实文件字节） */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 构造最小 JPEG（SOI + APP0 + SOF0，段长自洽） */
function jpegHeader(w: number, h: number): Uint8Array {
  const u8 = new Uint8Array(20);
  u8.set([0xff, 0xd8]); // SOI
  u8.set([0xff, 0xe0, 0x00, 0x04], 2); // APP0，len=4（仅含长度字段自身）
  u8.set([0xff, 0xc0, 0x00, 0x0b, 0x08], 8); // SOF0：len=11，precision=8
  const dv = new DataView(u8.buffer);
  dv.setUint16(13, h);
  dv.setUint16(15, w);
  return u8;
}

describe('sniffImage', () => {
  it('识别 PNG 及尺寸', () => {
    const info = sniffImage(pngHeader(320, 240));
    expect(info).toMatchObject({ format: 'PNG', ext: 'png', width: 320, height: 240 });
  });

  it('识别 JPEG', () => {
    const info = sniffImage(jpegHeader(200, 100));
    expect(info!.format).toBe('JPEG');
  });

  it('真实 1×1 PNG', () => {
    const info = sniffImage(b64Decode(TINY_PNG_BASE64));
    expect(info).toMatchObject({ format: 'PNG', width: 1, height: 1 });
  });

  it('未知格式返回 null', () => {
    expect(sniffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe('addImage', () => {
  it('嵌入 PNG：DocumentRes + Res 文件 + ImageObject', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addImage(b64Decode(TINY_PNG_BASE64), 'PNG', 10, 10, 30, 20);
    const files = readZip(doc.output('uint8array') as Uint8Array);

    expect([...files.keys()]).toContain('Doc_0/DocumentRes.xml');
    expect([...files.keys()]).toContain('Doc_0/Res/Image_0.png');

    const dres = text(files, 'Doc_0/DocumentRes.xml');
    expect(dres).toContain('<ofd:MultiMedia ID="2" Type="Image" Format="PNG">');
    expect(dres).toContain('<ofd:MediaFile>Image_0.png</ofd:MediaFile>');
    expect(dres).toContain('BaseLoc="Res"');

    const c0 = text(files, 'Doc_0/Pages/Page_0/Content.xml');
    expect(c0).toContain('<ofd:ImageObject');
    expect(c0).toContain('ResourceID="2"');
    expect(c0).toContain('Boundary="10 10 30 20"');

    const imgBytes = files.get('Doc_0/Res/Image_0.png')!;
    expect(imgBytes.length).toBe(b64Decode(TINY_PNG_BASE64).length);
  });

  it('相同数据去重（哈希键）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const data = b64Decode(TINY_PNG_BASE64);
    doc.addImage(data, 'PNG', 10, 10, 30, 20);
    doc.addImage(data, 'PNG', 50, 10, 30, 20);
    doc.addImage(data, 'PNG', 90, 10, 30, 20);
    const files = readZip(doc.output('uint8array') as Uint8Array);
    const images = [...files.keys()].filter((k) => k.startsWith('Doc_0/Res/'));
    expect(images.length).toBe(1); // 同一数据只存一份
  });

  it('缺省宽高按 72dpi 原始尺寸（序列化为 mm）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.addImage(pngHeader(400, 300), 'PNG', 0, 0);
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    // 400×300 px → 300×225pt → 105.8333×79.375mm
    expect(c0).toContain('Boundary="0 0 105.8333 79.375"');
  });

  it('旋转图片输出 CTM（绕中心 90°，包围盒宽高互换）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addImage(b64Decode(TINY_PNG_BASE64), 'PNG', 40, 40, 20, 10, undefined, undefined, 90);
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toMatch(/CTM="0 20 -10 0 [-\d.]+ [-\d.]+"/);
    // 中心 (50,45)，旋转后包围盒 [45,55]×[35,55]
    expect(c0).toMatch(/Boundary="45 35 10 20"/);
  });

  it('getImageProperties', () => {
    const doc = new jsOFD();
    const props = doc.getImageProperties('data:image/png;base64,' + TINY_PNG_BASE64);
    expect(props.fileType).toBe('PNG');
    expect(props.width).toBe(1);
  });
});
