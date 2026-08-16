import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("ZIP inválido: diretório central não encontrado");
}

function decodeFilename(bytes, utf8) {
  return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(bytes);
}

export function readZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 ainda não é suportado pelo leitor interno");
  }
  if (centralOffset + centralSize > buffer.length) throw new Error("ZIP inválido: diretório central truncado");

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new Error(`ZIP inválido: entrada central ${index} corrompida`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeFilename(nameBytes, Boolean(flags & 0x0800));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x0001) throw new Error(`ZIP não suportado: entrada criptografada ${name}`);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error(`ZIP inválido: cabeçalho local ausente em ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (compressionMethod === 0) data = Buffer.from(compressed);
    else if (compressionMethod === 8) data = inflateRawSync(compressed);
    else throw new Error(`ZIP não suportado: método ${compressionMethod} em ${name}`);
    if (data.length !== uncompressedSize) throw new Error(`ZIP inválido: tamanho incorreto em ${name}`);
    entries.push({ name, data });
  }
  return entries;
}
