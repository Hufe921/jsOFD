import * as asn1js from 'asn1js';
import { parseDer, readSequence } from './der';

export interface SesHeader {
  id: string;
  version: number;
  vid: string;
}

export interface SesProperty {
  type: number;
  name: string;
  certList: Uint8Array[];
  createDate: Date;
  validStart: Date;
  validEnd: Date;
}

export interface SesPicture {
  type: string;
  data: Uint8Array;
  width: number;
  height: number;
}

export interface SesSealInfo {
  header: SesHeader;
  esId: string;
  property: SesProperty;
  picture: SesPicture;
  extensions?: Uint8Array;
  rawDer: Uint8Array;
}

export type SesSealInfoInput = Omit<SesSealInfo, 'rawDer'> & { rawDer?: Uint8Array };

export interface SesSeal {
  info: SesSealInfo;
  makerCertificate: Uint8Array;
  signAlgId: string;
  signedValue: Uint8Array;
}

export type SesSealInput = Omit<SesSeal, 'info'> & { info: SesSealInfoInput };

export interface SesTbsSign {
  version: number;
  eseal: SesSeal;
  timeInfo: Date;
  dataHash: Uint8Array;
  propertyInfo: string;
  extensions?: Uint8Array;
  rawDer: Uint8Array;
}

export type SesTbsSignInput = Omit<SesTbsSign, 'rawDer' | 'eseal'> & {
  eseal: SesSealInput;
  rawDer?: Uint8Array;
};

export interface SesSignature {
  toSign: SesTbsSign;
  signingCertificate: Uint8Array;
  signatureAlgId: string;
  signature: Uint8Array;
  timeStamp?: Uint8Array;
}

export type SesSignatureInput = Omit<SesSignature, 'toSign'> & { toSign: SesTbsSignInput };

function raw(block: asn1js.BaseBlock): Uint8Array {
  return block.valueBeforeDecodeView.slice();
}

function hex(block: asn1js.BaseBlock): Uint8Array {
  return (block.valueBlock as unknown as { valueHexView: Uint8Array }).valueHexView.slice();
}

function tagged(block: asn1js.BaseBlock, tag: number): boolean {
  return block.idBlock.tagClass === 3 && block.idBlock.tagNumber === tag;
}

function seq(...items: asn1js.BaseBlock[]): asn1js.Sequence {
  return new asn1js.Sequence({ value: items });
}

function ia5(value: string): asn1js.IA5String {
  return new asn1js.IA5String({ value });
}

function utf8(value: string): asn1js.Utf8String {
  return new asn1js.Utf8String({ value });
}

function integer(value: number): asn1js.Integer {
  return asn1js.Integer.fromBigInt(value);
}

function octets(value: Uint8Array): asn1js.OctetString {
  return new asn1js.OctetString({ valueHex: value });
}

function bits(value: Uint8Array): asn1js.BitString {
  return new asn1js.BitString({ valueHex: value });
}

function oid(value: string): asn1js.ObjectIdentifier {
  return new asn1js.ObjectIdentifier({ value });
}

function encoded(block: asn1js.BaseBlock): Uint8Array {
  return new Uint8Array(block.toBER());
}

function stringField(block: asn1js.BaseBlock, expected: 'ia5' | 'utf8'): string {
  if (expected === 'ia5' && !(block instanceof asn1js.IA5String)) throw new Error('SES IA5String expected');
  if (expected === 'utf8' && !(block instanceof asn1js.Utf8String)) throw new Error('SES UTF8String expected');
  return (block as asn1js.BaseStringBlock).getValue();
}

function integerField(block: asn1js.BaseBlock): number {
  if (!(block instanceof asn1js.Integer)) throw new Error('SES INTEGER expected');
  return Number(block.toBigInt());
}

function timeField(block: asn1js.BaseBlock, generalized = false): Date {
  if (generalized && !(block instanceof asn1js.GeneralizedTime)) {
    throw new Error('SES GeneralizedTime expected');
  }
  if (!generalized && !(block instanceof asn1js.UTCTime) && !(block instanceof asn1js.GeneralizedTime)) {
    throw new Error('SES time expected');
  }
  return (block as asn1js.UTCTime).toDate();
}

function parseHeader(block: asn1js.BaseBlock): SesHeader {
  const fields = readSequence(block, 3, 3).valueBlock.value;
  return {
    id: stringField(fields[0]!, 'ia5'),
    version: integerField(fields[1]!),
    vid: stringField(fields[2]!, 'ia5'),
  };
}

function encodeHeader(header: SesHeader): asn1js.Sequence {
  return seq(ia5(header.id), integer(header.version), ia5(header.vid));
}

function parseProperty(block: asn1js.BaseBlock): SesProperty {
  const fields = readSequence(block, 6, 6).valueBlock.value;
  const certList = readSequence(fields[2]!, 0, Number.MAX_SAFE_INTEGER).valueBlock.value.map((cert) => {
    if (!(cert instanceof asn1js.OctetString)) throw new Error('SES certificate OCTET STRING expected');
    return hex(cert);
  });
  return {
    type: integerField(fields[0]!),
    name: stringField(fields[1]!, 'utf8'),
    certList,
    createDate: timeField(fields[3]!),
    validStart: timeField(fields[4]!),
    validEnd: timeField(fields[5]!),
  };
}

function encodeProperty(property: SesProperty): asn1js.Sequence {
  return seq(
    integer(property.type),
    utf8(property.name),
    seq(...property.certList.map(octets)),
    new asn1js.UTCTime({ valueDate: property.createDate }),
    new asn1js.UTCTime({ valueDate: property.validStart }),
    new asn1js.UTCTime({ valueDate: property.validEnd }),
  );
}

function parsePicture(block: asn1js.BaseBlock): SesPicture {
  const fields = readSequence(block, 4, 4).valueBlock.value;
  if (!(fields[1] instanceof asn1js.OctetString)) throw new Error('SES picture OCTET STRING expected');
  return {
    type: stringField(fields[0]!, 'ia5'),
    data: hex(fields[1]),
    width: integerField(fields[2]!),
    height: integerField(fields[3]!),
  };
}

function encodePicture(picture: SesPicture): asn1js.Sequence {
  return seq(ia5(picture.type), octets(picture.data), integer(picture.width), integer(picture.height));
}

function parseSealInfo(block: asn1js.BaseBlock): SesSealInfo {
  const fields = readSequence(block, 4, 5).valueBlock.value;
  return {
    header: parseHeader(fields[0]!),
    esId: stringField(fields[1]!, 'ia5'),
    property: parseProperty(fields[2]!),
    picture: parsePicture(fields[3]!),
    extensions: fields[4] ? raw(fields[4]) : undefined,
    rawDer: raw(block),
  };
}

export function encodeSesSealInfo(info: SesSealInfoInput): Uint8Array {
  return encoded(
    seq(
      encodeHeader(info.header),
      ia5(info.esId),
      encodeProperty(info.property),
      encodePicture(info.picture),
      ...(info.extensions ? [parseDer(info.extensions)] : []),
    ),
  );
}

export function parseSesSeal(der: Uint8Array): SesSeal {
  const fields = readSequence(parseDer(der), 4, 4).valueBlock.value;
  if (!(fields[1] instanceof asn1js.OctetString) || !(fields[2] instanceof asn1js.ObjectIdentifier) || !(fields[3] instanceof asn1js.BitString)) {
    throw new Error('SES invalid seal fields');
  }
  return {
    info: parseSealInfo(fields[0]!),
    makerCertificate: hex(fields[1]),
    signAlgId: fields[2].getValue(),
    signedValue: hex(fields[3]),
  };
}

export function encodeSesSeal(seal: SesSealInput): Uint8Array {
  const info = parseDer(encodeSesSealInfo(seal.info));
  return encoded(seq(info, octets(seal.makerCertificate), oid(seal.signAlgId), bits(seal.signedValue)));
}

function parseTbsSign(block: asn1js.BaseBlock): SesTbsSign {
  const fields = readSequence(block, 5, 6).valueBlock.value;
  if (!(fields[2] instanceof asn1js.GeneralizedTime) || !(fields[3] instanceof asn1js.BitString)) {
    throw new Error('SES invalid TBS fields');
  }
  const sealDer = raw(fields[1]!);
  return {
    version: integerField(fields[0]!),
    eseal: parseSesSeal(sealDer),
    timeInfo: timeField(fields[2], true),
    dataHash: hex(fields[3]),
    propertyInfo: stringField(fields[4]!, 'ia5'),
    extensions: fields[5] && tagged(fields[5], 0)
      ? raw((fields[5].valueBlock as unknown as { value: asn1js.BaseBlock[] }).value[0]!)
      : undefined,
    rawDer: raw(block),
  };
}

export function encodeTbsSign(tbs: SesTbsSignInput): Uint8Array {
  const items: asn1js.BaseBlock[] = [
    integer(tbs.version),
    parseDer(encodeSesSeal(tbs.eseal)),
    new asn1js.GeneralizedTime({ valueDate: tbs.timeInfo }),
    bits(tbs.dataHash),
    ia5(tbs.propertyInfo),
  ];
  if (tbs.extensions) {
    items.push(new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [parseDer(tbs.extensions)] }));
  }
  return encoded(seq(...items));
}

export function parseSesSignature(der: Uint8Array): SesSignature {
  const fields = readSequence(parseDer(der), 4, 5).valueBlock.value;
  if (!(fields[1] instanceof asn1js.OctetString) || !(fields[2] instanceof asn1js.ObjectIdentifier) || !(fields[3] instanceof asn1js.BitString)) {
    throw new Error('SES invalid signature fields');
  }
  let timeStamp: Uint8Array | undefined;
  if (fields[4]) {
    if (!tagged(fields[4], 0)) throw new Error('SES invalid timestamp tag');
    const content = (fields[4].valueBlock as unknown as { value: asn1js.BaseBlock[] }).value[0];
    if (!(content instanceof asn1js.BitString)) throw new Error('SES timestamp BIT STRING expected');
    timeStamp = hex(content);
  }
  return {
    toSign: parseTbsSign(fields[0]!),
    signingCertificate: hex(fields[1]),
    signatureAlgId: fields[2].getValue(),
    signature: hex(fields[3]),
    timeStamp,
  };
}

export function encodeSesSignature(signature: SesSignatureInput): Uint8Array {
  const items: asn1js.BaseBlock[] = [
    parseDer(encodeTbsSign(signature.toSign)),
    octets(signature.signingCertificate),
    oid(signature.signatureAlgId),
    bits(signature.signature),
  ];
  if (signature.timeStamp) {
    items.push(new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [bits(signature.timeStamp)] }));
  }
  return encoded(seq(...items));
}
