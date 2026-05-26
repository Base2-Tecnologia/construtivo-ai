/**
 * testar-acomp.js — Testa ConsultarAcompanhamento direto na API UAU
 * Uso: docker exec construtivo-obras-api node scripts/testar-acomp.js
 */
const db = require('../api/db');

async function main() {
  const r = await db.query(`SELECT valor FROM configuracoes WHERE chave = 'uau'`);
  const cfg = r.rows[0]?.valor;
  if (!cfg) { console.error('Config UAU não encontrada'); process.exit(1); }

  const base = `${(cfg.api_url || '').replace(/\/+$/, '')}/api/v${(cfg.api_versao || '1').replace(/\/+$/, '')}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-INTEGRATION-Authorization': cfg.api_key || '',
  };

  // 1. Autenticar
  console.log('\n=== 1. Autenticando ===');
  const authR = await fetch(`${base}/Autenticador/AutenticarUsuario`, {
    method: 'POST', headers,
    body: JSON.stringify({ Login: cfg.login, Senha: cfg.senha }),
  });
  const authRaw = await authR.text();
  let token = authR.headers.get('Authorization') || '';
  if (!token) {
    try { const p = JSON.parse(authRaw); token = p?.token || p?.Token || p?.access_token || ''; } catch {}
  }
  console.log(`HTTP ${authR.status} | token: ${token ? token.slice(0, 40) + '...' : '(vazio)'}`);
  if (!authR.ok) { console.error('Falha na autenticação:', authRaw); process.exit(1); }

  if (token) headers['Authorization'] = token;

  // 2. ConsultarAcompanhamento C0140
  console.log('\n=== 2. ConsultarAcompanhamento (Empresa=13, Contrato=26, Servico=C0140) ===');
  const url = `${base}/AcompanhamentosServicos/ConsultarAcompanhamentoContratoServicoPorContratoEServico`;
  const body = { Empresa: 13, Contrato: 26, Servico: 'C0140' };
  console.log('POST', url);
  console.log('Body:', JSON.stringify(body));

  const consultR = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  const consultRaw = await consultR.text();
  console.log(`\nHTTP ${consultR.status}`);
  try {
    const data = JSON.parse(consultRaw);
    console.log(JSON.stringify(data, null, 2));

    // Resumo de elegibilidade
    const arr = Array.isArray(data) ? data : [data];
    console.log('\n=== Resumo de elegibilidade ===');
    for (const rec of arr) {
      const codAec   = rec?.Cod_aec;
      const codMed   = rec?.CodMed_aec;
      const serv     = rec?.Serv_aec;
      const elegivel = codMed == null || codMed === 0 || codMed === '0';
      console.log(`Cod_aec=${codAec} | CodMed_aec=${codMed} | Serv=${serv} | ELEGÍVEL=${elegivel ? 'SIM ✅' : 'NÃO ❌ (já vinculado à medição ' + codMed + ')'}`);
    }
  } catch {
    console.log('(resposta não é JSON):', consultRaw);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.pool?.end?.());
