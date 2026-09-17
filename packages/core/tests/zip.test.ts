import { describe, expect, it } from 'vitest';
import { crc32, utf8Encode } from '../src/utils';
import { zipStore } from '../src/zip';
import { readZip, text } from './helpers/zipreader';

describe('crc32', () => {
  it('标准测试向量', () => {
    // CRC-32/ISO-HDLC 的经典校验值
    expect(crc32(utf8Encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zipStore', () => {
  it('保持条目顺序（OFD.xml 必须首个）', () => {
    const zip = zipStore([
      { name: 'OFD.xml', data: utf8Encode('<a/>') },
      { name: 'Doc_0/Document.xml', data: utf8Encode('<b/>') },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(['OFD.xml', 'Doc_0/Document.xml']);
  });

  it('内容往返一致（中文/emoji）', () => {
    const content = '你好，OFD！🎉 <xml>&amp;</xml>';
    const zip = zipStore([{ name: 'Doc_0/x.xml', data: utf8Encode(content) }]);
    const files = readZip(zip);
    expect(text(files, 'Doc_0/x.xml')).toBe(content);
  });

  it('空数据条目', () => {
    const zip = zipStore([{ name: 'empty', data: new Uint8Array(0) }]);
    const files = readZip(zip);
    expect(files.get('empty')!.length).toBe(0);
  });
});
