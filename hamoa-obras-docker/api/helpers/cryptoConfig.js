'use strict';
/**
 * cryptoConfig.js — Criptografia de campos sensíveis em configuracoes
 *
 * Usa AES-256-GCM com a chave derivada de CRYPTO_SECRET (env).
 * Formato cifrado: "enc:v1:<nonce_hex>:<ciphertext_hex>:<authTag_hex>"
 *
 * Uso:
 *   const { getConfig } = require('./cryptoConfig');
 *   const cfg = await getConfig('uau', db);  // retorna objeto com senhas já decifradas
 */

const crypto = require('crypto');

// ── Chave de cifração ─────────────────────────────────────────────
const _secret = process.env.CRYPTO_SECRET || '';
let _key = null;

function _getKey() {
  if (_key) return _key;
  if (!_secret || _secret.length < 16) {
    // Sem chave configurada: retorna null — cifragem desabilitada
    return null;
  }
  _key = crypto.createHash('sha256').update(_secret).digest(); // 32 bytes = AES-256
  return _key;
}

const ENC_PREFIX = 'enc:v1:';

/**
 * Cifra um texto usando AES-256-GCM.
 * Se CRYPTO_SECRET não estiver configurado, retorna o texto original.
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
  const key = _getKey();
  if (!key || !plaintext) return plaintext;
  // Idempotente: não re-cifra valores já cifrados (preserva senhas no PUT config)
  if (typeof plaintext === 'string' && plaintext.startsWith(ENC_PREFIX)) return plaintext;
  const nonce = crypto.randomBytes(12);                          // 96-bit nonce para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${ENC_PREFIX}${nonce.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decifra um valor cifrado.
 * Se o valor não começar com o prefixo "enc:v1:", retorna como está (compatibilidade).
 * @param {string} value
 * @returns {string}
 */
function decrypt(value) {
  if (!value || !value.startsWith(ENC_PREFIX)) return value; // não cifrado — compatibilidade
  const key = _getKey();
  if (!key) {
    console.warn('[cryptoConfig] CRYPTO_SECRET não configurado — retornando valor cifrado como está');
    return value;
  }
  try {
    const parts    = value.slice(ENC_PREFIX.length).split(':');
    const nonce    = Buffer.from(parts[0], 'hex');
    const ct       = Buffer.from(parts[1], 'hex');
    const tag      = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[cryptoConfig] Falha ao decifrar:', e.message);
    return value; // retorna cifrado para não quebrar a aplicação
  }
}

// ── Campos sensíveis por chave de configuração ────────────────────
const CAMPOS_SENHA = {
  notificacoes: ['smtpPass'],
  ldap:         ['bindPassword', 'password'],
  assinatura:   ['apiToken', 'apiSecret'],
  clicksign:    ['apiToken'],
  whatsapp:     ['apiKey', 'apiToken'],
  erp:          ['senha', 'password', 'apiToken'],
  storage:      ['secretKey', 'password'],
  ia:           ['apiKey'],
  uau:          ['senha', 'api_key'],
};

/**
 * Cifra os campos sensíveis de um objeto de configuração.
 * Retorna novo objeto com campos cifrados.
 */
function encryptFields(chave, valor) {
  const campos = CAMPOS_SENHA[chave];
  if (!campos || !valor || typeof valor !== 'object') return valor;
  const out = { ...valor };
  for (const campo of campos) {
    if (out[campo] && typeof out[campo] === 'string') {
      out[campo] = encrypt(out[campo]);
    }
  }
  return out;
}

/**
 * Decifra os campos sensíveis de um objeto de configuração.
 * Compatível com valores ainda não cifrados (retorna como está).
 */
function decryptFields(chave, valor) {
  const campos = CAMPOS_SENHA[chave];
  if (!campos || !valor || typeof valor !== 'object') return valor;
  const out = { ...valor };
  for (const campo of campos) {
    if (out[campo] && typeof out[campo] === 'string') {
      out[campo] = decrypt(out[campo]);
    }
  }
  return out;
}

/**
 * Mascara os campos sensíveis para exibição no frontend.
 * Retorna um objeto com campos sensíveis substituídos por '***'.
 */
function maskFields(chave, valor) {
  const campos = CAMPOS_SENHA[chave];
  if (!campos || !valor || typeof valor !== 'object') return valor;
  const out = { ...valor };
  for (const campo of campos) {
    if (out[campo]) out[campo] = '***';
  }
  return out;
}

/**
 * Lê a configuração do banco e decifra os campos sensíveis.
 * Substitui chamadas diretas a: db.query("SELECT valor FROM configuracoes WHERE chave=...")
 *
 * @param {string} chave - chave da configuração (ex: 'uau', 'whatsapp')
 * @param {object} dbPool - pool de conexão PostgreSQL
 * @returns {Promise<object|null>} objeto de configuração com senhas decifradas, ou null
 */
async function getConfig(chave, dbPool) {
  const r = await dbPool.query('SELECT valor FROM configuracoes WHERE chave=$1', [chave]);
  if (!r.rows[0]) return null;
  return decryptFields(chave, r.rows[0].valor);
}

module.exports = { encrypt, decrypt, encryptFields, decryptFields, maskFields, getConfig, CAMPOS_SENHA };
