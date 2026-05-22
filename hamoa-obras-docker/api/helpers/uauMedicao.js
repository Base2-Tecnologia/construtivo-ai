/**
 * uauMedicao.js — Integração UAU ERP: ManterMedicao
 *
 * Cria uma medição no ERP UAU quando a medição é aprovada no Construtivo.
 * A função é idempotente: se uau_medicao_id já estiver preenchido, retorna sem fazer nada.
 *
 * Chamada fire-and-forget em api/routes/medicoes.js após aprovação final (N3).
 */

const db = require('../db');

// Helper: lê configuração UAU
async function _getUauCfg() {
  const r = await db.query(`SELECT valor FROM configuracoes WHERE chave = 'uau'`);
  if (!r.rows[0]) throw new Error('Configuração UAU não encontrada');
  return r.rows[0].valor;
}

// Helper: monta URL base
function _baseUrl(cfg) {
  const url    = (cfg.api_url || '').replace(/\/+$/, '');
  const versao = (cfg.api_versao || '1').replace(/\/+$/, '');
  return `${url}/api/v${versao}`;
}

// Helper: headers padrão
function _headers(cfg, userToken) {
  const h = {
    'Content-Type':                  'application/json',
    'X-INTEGRATION-Authorization':   cfg.api_key || '',
  };
  if (userToken) h['Authorization'] = userToken;
  return h;
}

// Helper: autentica no UAU e retorna token
async function _autenticar(cfg) {
  const base    = _baseUrl(cfg);
  const authUrl = `${base}/Autenticador/AutenticarUsuario`;
  const authR   = await fetch(authUrl, {
    method:  'POST',
    headers: _headers(cfg),
    body:    JSON.stringify({ Login: cfg.login, Senha: cfg.senha }),
  });

  const authRaw = await authR.text().catch(() => '');
  let authParsed;
  try { authParsed = JSON.parse(authRaw); } catch { authParsed = null; }

  if (!authR.ok) {
    const detail = (typeof authParsed === 'object' && authParsed)
      ? (authParsed?.Message || authParsed?.message || `HTTP ${authR.status}`)
      : authRaw.slice(0, 200);
    throw new Error(`Falha na autenticação UAU: ${detail}`);
  }

  const token =
    authR.headers.get('Authorization') ||
    (typeof authParsed === 'object' && authParsed
      ? (authParsed.token || authParsed.Token || authParsed.access_token || authParsed.AccessToken || '')
      : '') ||
    (typeof authParsed === 'string' && authParsed.length > 20 ? authParsed : '') ||
    '';

  return token;
}

// ============================================================================
// integrarMedicaoUAU(medicaoId, params)
//
// Fluxo:
//   1. Verifica idempotência (uau_medicao_id já preenchido -> pula)
//   2. Busca dados da medição + contrato (uau_empresa, uau_contrato) + vínculos
//   3. Valida pré-condições (UAU ativo, contrato com código UAU)
//   4. Autentica no UAU
//   5. Monta payload ManterMedicao e envia
//   6. Parseia retorno e salva uau_medicao_id + uau_integrado_em na medição
// ============================================================================
// Retorna { ok: true, uauMedicaoId, jaIntegrada? } ou { ok: false, error: 'mensagem' }
// params: { codigoFornecedor, codigoItem, codigoAcompanhamento } — informados manualmente pelo usuário
async function integrarMedicaoUAU(medicaoId, params = {}) {
  const tag = `[uau/ManterMedicao] medicao=${medicaoId}`;
  try {

    // 1. Idempotência
    const idempR = await db.query(
      `SELECT uau_medicao_id FROM medicoes WHERE id = $1`, [medicaoId]
    );
    if (!idempR.rows[0]) {
      console.warn(`${tag} Medição não encontrada`);
      return { ok: false, error: 'Medição não encontrada' };
    }
    if (idempR.rows[0].uau_medicao_id != null) {
      console.log(`${tag} Já integrada (uau_medicao_id=${idempR.rows[0].uau_medicao_id}) — pulando`);
      return { ok: true, uauMedicaoId: idempR.rows[0].uau_medicao_id, jaIntegrada: true };
    }

    // 2. Configuração UAU
    const cfg = await _getUauCfg();
    if (!cfg.ativo) {
      console.log(`${tag} Integração UAU não está ativa — pulando`);
      return { ok: false, error: 'Integração UAU não está ativa. Ative em Configurações -> Integração ERP.' };
    }
    if (!cfg.api_url || !cfg.login || !cfg.senha) {
      console.warn(`${tag} Configuração UAU incompleta (api_url/login/senha) — pulando`);
      return { ok: false, error: 'Configuração UAU incompleta (URL/login/senha). Verifique em Configurações -> Integração ERP.' };
    }

    // 3. Busca dados da medição + contrato + empresa
    const medR = await db.query(`
      SELECT
        m.id,
        m.codigo,
        m.periodo,
        m.valor_medicao,
        m.contrato_id,
        c.uau_empresa    AS contrato_uau_empresa,
        c.uau_contrato   AS contrato_uau_contrato,
        c.numero         AS contrato_numero,
        o.nome           AS obra_nome,
        emp.uau_empresa  AS empresa_uau_codigo
      FROM medicoes m
      JOIN contratos    c   ON c.id   = m.contrato_id
      JOIN obras        o   ON o.id   = c.obra_id
      JOIN empresas     emp ON emp.id = c.empresa_id
      WHERE m.id = $1
    `, [medicaoId]);

    if (!medR.rows[0]) {
      console.warn(`${tag} Medição não encontrada após re-consulta`);
      return { ok: false, error: 'Medição não encontrada' };
    }
    const med = medR.rows[0];

    // Prioridade empresa: empresa.uau_empresa -> contrato.uau_empresa -> config global
    const codigoEmpresa  = med.empresa_uau_codigo || med.contrato_uau_empresa || cfg.empresa_codigo;
    const codigoContrato = med.contrato_uau_contrato;

    console.log(`${tag} Fontes — empresa: emp=${med.empresa_uau_codigo} | cont=${med.contrato_uau_empresa} | cfg=${cfg.empresa_codigo} -> usando=${codigoEmpresa}`);
    console.log(`${tag} Fontes — contrato UAU: ${codigoContrato}`);

    if (!codigoContrato) {
      const msg = `Contrato "${med.contrato_numero}" não possui código UAU cadastrado. Configure em Cadastros -> Contratos.`;
      console.warn(`${tag} ${msg}`);
      return { ok: false, error: msg };
    }
    if (!codigoEmpresa) {
      const msg = 'Código da empresa UAU não configurado. Configure em Configurações -> Integração ERP ou no cadastro do contrato.';
      console.warn(`${tag} ${msg}`);
      return { ok: false, error: msg };
    }

    // 4. Decompõe período YYYY-MM
    // periodo é VARCHAR(7) no formato "YYYY-MM" (ex: "2025-05")
    const [anoStr, mesStr] = (med.periodo || '').split('-');

    // DataBase: primeiro dia do mês de referência em ISO 8601
    const dataBase = (anoStr && mesStr)
      ? `${anoStr}-${mesStr.padStart(2, '0')}-01T00:00:00.000Z`
      : new Date().toISOString();

    // 5. Params manuais (digitados pelo usuário no popup)
    const { codigoItem = null, codigoAcompanhamento = null, codigoFornecedor = null } = params;

    // 6. Valida params obrigatórios e converte para inteiros
    const empresaInt  = parseInt(codigoEmpresa, 10);
    const contratoInt = parseInt(codigoContrato, 10);

    if (isNaN(empresaInt)) {
      return { ok: false, error: `Código da empresa UAU inválido: "${codigoEmpresa}". Verifique o cadastro da empresa ou do contrato.` };
    }
    if (isNaN(contratoInt)) {
      return { ok: false, error: `Código do contrato UAU inválido: "${codigoContrato}". Verifique o cadastro do contrato.` };
    }
    if (!codigoFornecedor && codigoFornecedor !== 0) {
      return { ok: false, error: 'Código do fornecedor UAU não informado. Informe o código interno do fornecedor no UAU.' };
    }
    const fornecedorInt = parseInt(codigoFornecedor, 10);
    if (isNaN(fornecedorInt)) {
      return { ok: false, error: `Código do fornecedor UAU inválido: "${codigoFornecedor}".` };
    }

    // 7. Monta Itens
    let itens = [];
    if (codigoItem != null && codigoItem !== '') {
      const item = { Item: codigoItem }; // string WBS já zero-padded ("01.01.01.01")
      if (codigoAcompanhamento != null && codigoAcompanhamento !== '') {
        item.CodigoAcompanhamento = parseInt(codigoAcompanhamento, 10);
      }
      itens = [item];
      console.log(`${tag} Itens: ${JSON.stringify(itens)}`);
    } else {
      console.log(`${tag} Itens não enviados (codigoItem=${codigoItem})`);
    }

    // 8. Payload ManterMedicao (estrutura conforme documentação UAU)
    const payload = {
      Empresa:          empresaInt,
      NumeroContrato:   contratoInt,
      NumeroMedicao:    0,
      CodigoFornecedor: fornecedorInt,
      Observacao:       `Medicao ${med.codigo} via Construtivo`,
      UltimaMedicao:    0,
      DataBase:         dataBase,
      UsrCadastro:      cfg.login || '',
      Itens:            itens,
    };

    console.log(`${tag} Autenticando no UAU...`);
    const userToken = await _autenticar(cfg);

    const base   = _baseUrl(cfg);
    const medUrl = `${base}/Medicao/ManterMedicao`;

    // Log completo do payload para diagnóstico
    console.log(`${tag} Enviando ManterMedicao -> ${medUrl}`);
    console.log(`${tag} Payload completo:`, JSON.stringify(payload, null, 2));

    const medR2 = await fetch(medUrl, {
      method:  'POST',
      headers: _headers(cfg, userToken),
      body:    JSON.stringify(payload),
    });

    // Lê o body como texto primeiro — para conseguir logar o raw mesmo se JSON falhar
    const medRawText = await medR2.text().catch(() => '');
    let medData;
    try { medData = JSON.parse(medRawText); } catch { medData = medRawText || null; }

    console.log(`${tag} Resposta UAU HTTP ${medR2.status} | raw: ${medRawText.slice(0, 500)}`);

    // Helper: converte qualquer valor para string legível
    const _str = v => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      return JSON.stringify(v);
    };

    // 9. Parseia retorno
    // Padrão UAU: número direto, array [id, errCod, errMsg], objeto { ... }, ou string
    let uauMedicaoId = null;
    let uauErro = null;

    if (typeof medData === 'number' && medData > 0) {
      uauMedicaoId = medData;
    } else if (Array.isArray(medData)) {
      // UAU pode retornar [id, errCod, errMsg] onde cada elemento pode ser primitivo ou objeto.
      // Varre o array procurando objetos de erro (com Mensagem/Message) e números/strings de ID.
      const _extractErrObj = v => {
        if (v == null) return null;
        if (typeof v === 'object' && !Array.isArray(v)) {
          const msg = v.Mensagem ?? v.Message ?? v.message ?? v.mensagem ??
                      v.Descricao ?? v.Error   ?? v.error   ?? null;
          return msg != null ? _str(msg) : JSON.stringify(v);
        }
        return null;
      };

      // Tenta encontrar um objeto de erro em qualquer posição do array
      let erroDeObj = null;
      for (const el of medData) {
        const e = _extractErrObj(el);
        if (e) { erroDeObj = e; break; }
      }

      if (erroDeObj) {
        uauErro = erroDeObj;
      } else {
        // Fallback: formato clássico [id, errCod, errMsg]
        const rawId  = medData[0];
        const errCod = _str(medData[1]).trim();
        const errMsg = _str(medData[2]).trim() || _str(medData[3]).trim();
        const temErro = errCod !== '' && errCod !== '0';
        if (temErro) {
          uauErro = errMsg || `Código de erro UAU: ${errCod}`;
        } else {
          uauMedicaoId = rawId != null && rawId !== '' ? parseInt(rawId, 10) || rawId : null;
        }
      }
    } else if (medData && typeof medData === 'object') {
      // Prioridade 1: resposta de sucesso do ManterMedicao — contém NumeroMedicao > 0
      // O UAU pode retornar HTTP não-2xx mesmo em criações bem-sucedidas, então
      // checamos NumeroMedicao ANTES de avaliar o HTTP status.
      if (medData.NumeroMedicao != null && parseInt(medData.NumeroMedicao, 10) > 0) {
        uauMedicaoId = parseInt(medData.NumeroMedicao, 10);
      } else {
        // Prioridade 2: campo de erro explícito
        const errVal = medData.Message ?? medData.message ?? medData.Mensagem ?? medData.mensagem ??
                       medData.Error  ?? medData.error   ?? medData.Erro      ?? null;
        if (!medR2.ok || errVal != null) {
          // HTTP de erro OU campo de erro explícito: considera falha
          uauErro = errVal != null ? _str(errVal) : `HTTP ${medR2.status} — ${medRawText.slice(0, 300)}`;
        } else {
          // HTTP 2xx sem campo de erro: tenta extrair ID por outros campos conhecidos
          uauMedicaoId =
            medData.codigoMedicao ?? medData.codigo_medicao ?? medData.CodigoMedicao ??
            medData.id            ?? medData.Id             ??
            medData.numeroMedicao ?? null;
        }
      }
    } else if (typeof medData === 'string') {
      // String numérica = ID; string com texto = pode ser erro
      const trimmed = medData.trim();
      if (trimmed.length > 0 && !isNaN(trimmed)) {
        uauMedicaoId = parseInt(trimmed, 10);
      } else if (!medR2.ok && trimmed.length > 0) {
        uauErro = trimmed.slice(0, 300);
      }
    }

    // HTTP de erro sem ID e sem mensagem capturada: usa raw body como fallback
    if (!medR2.ok && uauMedicaoId == null && !uauErro) {
      uauErro = `HTTP ${medR2.status} — ${medRawText.slice(0, 300) || 'sem corpo na resposta'}`;
    }

    if (uauErro) {
      console.error(`${tag} UAU retornou erro: ${uauErro}`);
      return { ok: false, error: `UAU: ${uauErro}` };
    }

    if (uauMedicaoId == null) {
      // 2xx mas sem ID — consideramos sucesso parcial (salva com null e loga aviso)
      console.warn(`${tag} UAU respondeu 2xx mas não retornou ID de medição. Raw: ${medRawText.slice(0, 200)}`);
    }

    // 10. Salva resultado no banco
    await db.query(
      `UPDATE medicoes
          SET uau_medicao_id   = $1,
              uau_integrado_em = NOW()
        WHERE id = $2`,
      [uauMedicaoId ?? null, medicaoId]
    );

    console.log(`${tag} ManterMedicao concluído — uau_medicao_id=${uauMedicaoId} registrado`);
    return { ok: true, uauMedicaoId };

  } catch (err) {
    console.error(`${tag} Erro inesperado:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { integrarMedicaoUAU };
