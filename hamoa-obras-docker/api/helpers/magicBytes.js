'use strict';
/**
 * magicBytes.js — Detecção de tipo de arquivo por assinatura binária
 *
 * Valida que o conteúdo real do arquivo corresponde ao MIME declarado pelo cliente
 * (prevenção de upload de arquivos com extensão falsificada).
 *
 * Uso:
 *   const { detectMimeFromMagicBytes, isMimeSpoofed } = require('./magicBytes');
 *   const detectedMime = await detectMimeFromMagicBytes(filePath);
 *   if (isMimeSpoofed(claimedMime, detectedMime)) { // rejeita o upload }
 */

const fs = require('fs');

const HEADER_BYTES = 16; // lê os primeiros 16 bytes

/**
 * Lê os primeiros bytes do arquivo e retorna o MIME inferido pelas magic bytes.
 * Retorna null se o tipo não for reconhecido.
 * @param {string} filePath - caminho absoluto do arquivo já gravado em disco
 * @returns {Promise<string|null>}
 */
async function detectMimeFromMagicBytes(filePath) {
  const buf = Buffer.alloc(HEADER_BYTES);
  let fd;
  try {
    fd = await fs.promises.open(filePath, 'r');
    await fd.read(buf, 0, HEADER_BYTES, 0);
  } catch {
    return null; // não conseguiu ler — deixa passar (evita falsos positivos)
  } finally {
    if (fd) await fd.close().catch(() => {});
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
    return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
    return 'image/png';

  // GIF: 47 49 46 38 (GIF8)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return 'image/gif';

  // PDF: 25 50 44 46 (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
    return 'application/pdf';

  // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    return 'image/webp';

  // AVI: RIFF....AVI (bytes 8-11 = "AVI ")
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49 && buf[11] === 0x20)
    return 'video/x-msvideo';

  // MP4 / QuickTime: ftyp box at offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70)
    return 'video/mp4';

  // MKV/WebM: EBML header 1A 45 DF A3
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3)
    return 'video/x-matroska'; // covers both mkv and webm

  // ZIP (DOCX, XLSX, ODT, ODS are all ZIP): 50 4B 03 04
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04)
    return 'application/zip'; // generic; DOCX/XLSX/ODT use this signature

  // OLE2 compound (legacy .doc, .xls, .ppt): D0 CF 11 E0 A1 B1 1A E1
  if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0)
    return 'application/msword'; // generic OLE2; covers .doc, .xls, .ppt

  // Plain text: starts with printable ASCII (very simple heuristic)
  const isPrintable = (b) => (b >= 0x09 && b <= 0x0D) || (b >= 0x20 && b <= 0x7E);
  if ([...buf.slice(0, 8)].every(isPrintable))
    return 'text/plain';

  return null; // unknown binary
}

/**
 * Grupos de magic bytes: um MIME detectado pode ser aceito para múltiplos MIMEs declarados.
 * Ex.: ZIP cobre DOCX, XLSX, ODS, etc.
 */
const MAGIC_COMPATIBLE = {
  'image/jpeg':          new Set(['image/jpeg']),
  'image/png':           new Set(['image/png']),
  'image/gif':           new Set(['image/gif']),
  'image/webp':          new Set(['image/webp']),
  'application/pdf':     new Set(['application/pdf']),
  'application/zip':     new Set([
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',// .pptx
    'application/vnd.oasis.opendocument.text',                                 // .odt
    'application/vnd.oasis.opendocument.spreadsheet',                          // .ods
  ]),
  'application/msword':  new Set([
    'application/msword',          // .doc
    'application/vnd.ms-excel',    // .xls
    'application/vnd.ms-powerpoint',
  ]),
  'video/mp4':           new Set(['video/mp4', 'video/quicktime']),
  'video/x-msvideo':     new Set(['video/x-msvideo']),
  'video/x-matroska':    new Set(['video/x-matroska', 'video/webm']),
  'text/plain':          new Set(['text/plain']),
};

/**
 * Verifica se o MIME declarado pelo cliente NÃO corresponde ao conteúdo real.
 * @param {string} claimedMime - MIME declarado pelo browser no upload
 * @param {string|null} detectedMime - MIME detectado por magic bytes (null = desconhecido)
 * @returns {boolean} true = possível spoofing (rejeitar), false = OK
 */
function isMimeSpoofed(claimedMime, detectedMime) {
  // Se não conseguimos detectar, deixamos passar (arquivo binário desconhecido legítimo)
  if (detectedMime === null) return false;

  const compatSet = MAGIC_COMPATIBLE[detectedMime];
  if (!compatSet) return false; // tipo detectado não está no mapa — passa

  const claimed = (claimedMime || '').toLowerCase().split(';')[0].trim();
  return !compatSet.has(claimed);
}

module.exports = { detectMimeFromMagicBytes, isMimeSpoofed };
