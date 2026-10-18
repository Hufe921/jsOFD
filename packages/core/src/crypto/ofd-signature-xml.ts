import { OFD_NAMESPACE } from '../xml';
import { escapeXmlAttr, escapeXmlText, utf8Encode } from '../utils';
import { kids, parseXml } from '../xml-parse';

export interface SignatureReference {
  fileRef: string;
  checkValue: string;
}

export interface SignatureXmlInput {
  provider: { name: string; company?: string; version?: string };
  signatureMethod: string;
  signatureDateTime: string;
  checkMethod: string;
  references: SignatureReference[];
  stamp?: { pageRef: string; id: string; boundary: string; clip?: string };
  sealLoc?: string;
  signedValueLoc: string;
}

export interface SignatureListEntry {
  id: string;
  type: 'Seal' | 'Sign';
  baseLoc: string;
}

export function buildSignatureXml(input: SignatureXmlInput): Uint8Array {
  const provider =
    `ProviderName="${escapeXmlAttr(input.provider.name)}"` +
    (input.provider.company ? ` Company="${escapeXmlAttr(input.provider.company)}"` : '') +
    (input.provider.version ? ` Version="${escapeXmlAttr(input.provider.version)}"` : '');
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ofd:Signature xmlns:ofd="${OFD_NAMESPACE}">\n`;
  xml += `  <ofd:SignedInfo>\n    <ofd:Provider ${provider}/>\n`;
  xml += `    <ofd:SignatureMethod>${escapeXmlText(input.signatureMethod)}</ofd:SignatureMethod>\n`;
  xml += `    <ofd:SignatureDateTime>${escapeXmlText(input.signatureDateTime)}</ofd:SignatureDateTime>\n`;
  xml += `    <ofd:References CheckMethod="${escapeXmlAttr(input.checkMethod)}">\n`;
  for (const reference of input.references) {
    xml += `      <ofd:Reference FileRef="${escapeXmlAttr(reference.fileRef)}"><ofd:CheckValue>${escapeXmlText(reference.checkValue)}</ofd:CheckValue></ofd:Reference>\n`;
  }
  xml += '    </ofd:References>\n';
  if (input.stamp) {
    xml += `    <ofd:StampAnnot PageRef="${escapeXmlAttr(input.stamp.pageRef)}" ID="${escapeXmlAttr(input.stamp.id)}" Boundary="${escapeXmlAttr(input.stamp.boundary)}"`;
    if (input.stamp.clip) xml += ` Clip="${escapeXmlAttr(input.stamp.clip)}"`;
    xml += '/>\n';
  }
  if (input.sealLoc) {
    xml += `    <ofd:Seal><ofd:BaseLoc>${escapeXmlText(input.sealLoc)}</ofd:BaseLoc></ofd:Seal>\n`;
  }
  xml += '  </ofd:SignedInfo>\n';
  xml += `  <ofd:SignedValue>${escapeXmlText(input.signedValueLoc)}</ofd:SignedValue>\n</ofd:Signature>\n`;
  return utf8Encode(xml);
}

export function updateSignatureList(input: {
  existing?: Uint8Array;
  entry: SignatureListEntry;
  maxSignId: string;
}): Uint8Array {
  let prefix = 'ofd:';
  const entries: SignatureListEntry[] = [];
  if (input.existing) {
    const source = new TextDecoder().decode(input.existing);
    prefix = /<ofd:Signatures\b/.test(source) ? 'ofd:' : '';
    const root = parseXml(source);
    if (root.name !== 'Signatures') throw new Error('OFD invalid signature list root');
    for (const signature of kids(root, 'Signature')) {
      entries.push({
        id: signature.attrs.ID!,
        type: signature.attrs.Type as 'Seal' | 'Sign',
        baseLoc: signature.attrs.BaseLoc!,
      });
    }
  }
  entries.push(input.entry);
  const ns = prefix ? `xmlns:ofd="${OFD_NAMESPACE}"` : `xmlns="${OFD_NAMESPACE}"`;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${prefix}Signatures ${ns}>\n`;
  for (const entry of entries) {
    xml += `  <${prefix}Signature ID="${escapeXmlAttr(entry.id)}" Type="${escapeXmlAttr(entry.type)}" BaseLoc="${escapeXmlAttr(entry.baseLoc)}"/>\n`;
  }
  xml += `  <${prefix}MaxSignId>${escapeXmlText(input.maxSignId)}</${prefix}MaxSignId>\n</${prefix}Signatures>\n`;
  return utf8Encode(xml);
}
