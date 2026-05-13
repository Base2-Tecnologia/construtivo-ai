/**
 * CONSTRUTIVO OBRAS — Rotas do Canteiro de Obras
 *
 * GET    /api/canteiro/pendencias-material   → atividades com gatilho compra material vencendo
 * GET    /api/canteiro/req-materiais         → lista requisições do canteiro
 * POST   /api/canteiro/req-materiais         → abre nova requisição de material
 * GET    /api/canteiro/req-materiais/:id     → detalhe de uma requisição
 * PUT    /api/canteiro/req-materiais/:id     → atualiza status / campos
 */
'use strict';

const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { getObrasPermitidas } = require('../middleware/obras');

// ════════════════════════════════════════════════════════════════
// GET /api/canteiro/pendencias-material
// Atividades com Gatilho Compra Material vencendo (sem RM aberta)
// ════════════════════════════════════════════════════════════════
router.get('/pendencias-material', auth, async (req, res) => {
  try {
    const obrasPermitidas = await getObrasPermitidas(req, db);

    // Filtros opcionais
    const obraId   = req.query.obra_id   ? parseInt(req.query.obra_id)   : null;
    const status   = req.query.status    || null;  // vencido | proximo | todos
    const semRm    = req.query.sem_rm    !== 'false';  // default: só sem RM aberta

    // Monta lista de cronogramas permitidos
    let cronQuery;
    let cronParams = [];
    if (obrasPermitidas === null) {
      // ADM — todas as obras
      cronQuery = obraId
        ? 'SELECT id, obra_id FROM cronogramas WHERE obra_id = $1 AND ativo = true'
        : 'SELECT id, obra_id FROM cronogramas WHERE ativo = true';
      if (obraId) cronParams = [obraId];
    } else {
      const ids = obraId
        ? obrasPermitidas.filter(id => id === obraId)
        : obrasPermitidas;
      if (!ids.length) return res.json([]);
      cronQuery = `SELECT id, obra_id FROM cronogramas WHERE obra_id = ANY($1::int[]) AND ativo = true`;
      cronParams = [ids];
    }

    const cronRows = (await db.query(cronQuery, cronParams)).rows;
    if (!cronRows.length) return res.json([]);

    const cronIds  = cronRows.map(r => r.id);
    const obraMap  = {};
    for (const r of cronRows) obraMap[r.id] = r.obra_id;

    // Busca obras para nome
    const obrasResult = await db.query(
      'SELECT id, nome FROM obras WHERE id = ANY($1::int[])',
      [Object.values(obraMap)]
    );
    const obraNomes = {};
    for (const o of obrasResult.rows) obraNomes[o.id] = o.nome;

    // Atividades com gatilho_material (campo extras) e sem RM pendente/em_compra
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    const r = await db.query(`
      SELECT
        a.id,
        a.nome,
        a.wbs,
        a.cronograma_id,
        a.data_inicio,
        a.data_termino,
        a.gatilho_dias,
        a.campos_extras,
        a.grupo_pai,
        a.eh_resumo,
        (SELECT json_agg(json_build_object('id', rm.id, 'codigo', rm.codigo, 'status', rm.status))
           FROM req_materiais rm
          WHERE rm.atividade_id = a.id
            AND rm.status NOT IN ('cancelado')
          LIMIT 5) AS rms_ativas
      FROM atividades_cronograma a
      WHERE a.cronograma_id = ANY($1::int[])
        AND a.eh_resumo = false
        AND a.data_inicio IS NOT NULL
        AND (
          (a.campos_extras->>'Gatilho Compra Material') IS NOT NULL
          OR (a.campos_extras->>'Gatilho Projetos') IS NOT NULL
        )
      ORDER BY a.data_inicio ASC
    `, [cronIds]);

    const rows = r.rows
      .map(row => {
        const extras        = row.campos_extras || {};
        const gatilhoMat    = extras['Gatilho Compra Material'] != null
          ? parseInt(extras['Gatilho Compra Material'])
          : extras['Gatilho Projetos'] != null ? parseInt(extras['Gatilho Projetos']) : null;

        if (gatilhoMat == null || isNaN(gatilhoMat)) return null;

        const obraId       = obraMap[row.cronograma_id];
        const dataInicio   = row.data_inicio ? new Date(row.data_inicio.toISOString().slice(0,10) + 'T12:00:00') : null;
        const dataLimite   = dataInicio ? new Date(dataInicio.getTime() - gatilhoMat * 86400000) : null;
        const diasRestantes = dataLimite ? Math.floor((dataLimite - hoje) / 86400000) : null;

        let statusGatilho;
        if (!dataLimite)              statusGatilho = 'sem_data';
        else if (hoje > dataLimite)   statusGatilho = 'vencido';
        else if (diasRestantes <= 14) statusGatilho = 'proximo';
        else                          statusGatilho = 'ok';

        // Filtro de status
        if (status === 'vencido' && statusGatilho !== 'vencido') return null;
        if (status === 'proximo' && !['vencido','proximo'].includes(statusGatilho)) return null;

        const rmsAtivas = row.rms_ativas || [];
        const temRmAberta = rmsAtivas.some(rm => ['pendente','em_compra'].includes(rm.status));

        // Filtro sem_rm
        if (semRm && temRmAberta) return null;

        return {
          id:              row.id,
          nome:            row.nome,
          wbs:             row.wbs,
          grupo_pai:       row.grupo_pai,
          obra_id:         obraId,
          obra_nome:       obraNomes[obraId] || `Obra ${obraId}`,
          cronograma_id:   row.cronograma_id,
          data_inicio:     row.data_inicio ? row.data_inicio.toISOString().slice(0,10) : null,
          data_termino:    row.data_termino ? row.data_termino.toISOString().slice(0,10) : null,
          gatilho_material: gatilhoMat,
          data_limite_compra: dataLimite ? dataLimite.toISOString().slice(0,10) : null,
          dias_restantes:  diasRestantes,
          status_gatilho:  statusGatilho,
          rms_ativas:      rmsAtivas,
          tem_rm_aberta:   temRmAberta,
        };
      })
      .filter(Boolean);

    // Ordena: vencidos primeiro, depois por dias_restantes
    rows.sort((a, b) => {
      const ord = { vencido: 0, proximo: 1, ok: 2, sem_data: 3 };
      const diff = (ord[a.status_gatilho]??3) - (ord[b.status_gatilho]??3);
      if (diff !== 0) return diff;
      return (a.dias_restantes??999) - (b.dias_restantes??999);
    });

    res.json(rows);
  } catch (err) {
    console.error('[canteiro/pendencias-material]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/canteiro/req-materiais
// Lista requisições de material com filtros
// ════════════════════════════════════════════════════════════════
router.get('/req-materiais', auth, async (req, res) => {
  try {
    const obrasPermitidas = await getObrasPermitidas(req, db);

    const obraId = req.query.obra_id ? parseInt(req.query.obra_id) : null;
    const status = req.query.status  || null;
    const limit  = Math.min(parseInt(req.query.limit  || 100), 500);
    const offset = parseInt(req.query.offset || 0);

    const conds  = [];
    const params = [];
    let p = 1;

    if (obrasPermitidas !== null) {
      const ids = obraId ? obrasPermitidas.filter(id => id === obraId) : obrasPermitidas;
      if (!ids.length) return res.json([]);
      conds.push(`rm.obra_id = ANY($${p++}::int[])`); params.push(ids);
    } else if (obraId) {
      conds.push(`rm.obra_id = $${p++}`); params.push(obraId);
    }

    if (status) { conds.push(`rm.status = $${p++}`); params.push(status); }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const r = await db.query(`
      SELECT
        rm.*,
        o.nome  AS obra_nome,
        a.nome  AS atividade_nome,
        a.grupo_pai
      FROM req_materiais rm
      LEFT JOIN obras o ON o.id = rm.obra_id
      LEFT JOIN atividades_cronograma a ON a.id = rm.atividade_id
      ${where}
      ORDER BY
        CASE rm.status
          WHEN 'pendente'  THEN 0
          WHEN 'em_compra' THEN 1
          WHEN 'entregue'  THEN 2
          ELSE 3
        END,
        rm.criado_em DESC
      LIMIT $${p++} OFFSET $${p++}
    `, [...params, limit, offset]);

    res.json(r.rows);
  } catch (err) {
    console.error('[canteiro/req-materiais GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/canteiro/req-materiais
// Abre nova requisição de material
// ════════════════════════════════════════════════════════════════
router.post('/req-materiais', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const {
      atividade_id,
      cronograma_id,
      obra_id,
      descricao,
      quantidade,
      unidade,
      observacao,
      data_necessidade,
    } = req.body;

    if (!obra_id)    return res.status(400).json({ error: 'obra_id é obrigatório' });
    if (!descricao?.trim()) return res.status(400).json({ error: 'descricao é obrigatória' });

    const usuario = req.user?.login || req.user?.email || 'sistema';
    const nome    = req.user?.nome  || usuario;

    const r = await client.query(`
      INSERT INTO req_materiais
        (atividade_id, cronograma_id, obra_id, descricao, quantidade, unidade,
         observacao, data_necessidade, criado_por, criado_por_nome, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente')
      RETURNING *
    `, [
      atividade_id   || null,
      cronograma_id  || null,
      parseInt(obra_id),
      descricao.trim(),
      quantidade     || null,
      unidade        || null,
      observacao     || null,
      data_necessidade || null,
      usuario,
      nome,
    ]);

    const rm = r.rows[0];

    // Registra histórico
    await client.query(`
      INSERT INTO req_materiais_historico (rm_id, status_de, status_para, usuario, observacao)
      VALUES ($1, NULL, 'pendente', $2, 'Requisição criada')
    `, [rm.id, usuario]);

    await client.query('COMMIT');
    res.status(201).json(rm);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[canteiro/req-materiais POST]', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/canteiro/req-materiais/:id
// ════════════════════════════════════════════════════════════════
router.get('/req-materiais/:id', auth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT rm.*, o.nome AS obra_nome, a.nome AS atividade_nome
      FROM req_materiais rm
      LEFT JOIN obras o ON o.id = rm.obra_id
      LEFT JOIN atividades_cronograma a ON a.id = rm.atividade_id
      WHERE rm.id = $1
    `, [parseInt(req.params.id)]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Não encontrado' });

    const hist = await db.query(
      'SELECT * FROM req_materiais_historico WHERE rm_id = $1 ORDER BY criado_em ASC',
      [parseInt(req.params.id)]
    );

    res.json({ ...r.rows[0], historico: hist.rows });
  } catch (err) {
    console.error('[canteiro/req-materiais/:id GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PUT /api/canteiro/req-materiais/:id
// Atualiza status ou campos da requisição
// ════════════════════════════════════════════════════════════════
router.put('/req-materiais/:id', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const id = parseInt(req.params.id);

    const cur = await client.query('SELECT * FROM req_materiais WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Não encontrado' }); }

    const {
      status,
      descricao,
      quantidade,
      unidade,
      observacao,
      atendido_por,
      obs_status,
    } = req.body;

    const VALID_STATUS = ['pendente','em_compra','entregue','cancelado'];
    if (status && !VALID_STATUS.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Status inválido. Use: ${VALID_STATUS.join(', ')}` });
    }

    const usuario    = req.user?.login || req.user?.email || 'sistema';
    const statusAnt  = cur.rows[0].status;

    const r = await client.query(`
      UPDATE req_materiais SET
        status          = COALESCE($1, status),
        descricao       = COALESCE($2, descricao),
        quantidade      = COALESCE($3, quantidade),
        unidade         = COALESCE($4, unidade),
        observacao      = COALESCE($5, observacao),
        atendido_por    = COALESCE($6, atendido_por),
        atualizado_em   = NOW()
      WHERE id = $7
      RETURNING *
    `, [status||null, descricao||null, quantidade||null, unidade||null, observacao||null, atendido_por||null, id]);

    // Registra histórico se mudou status
    if (status && status !== statusAnt) {
      await client.query(`
        INSERT INTO req_materiais_historico (rm_id, status_de, status_para, usuario, observacao)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, statusAnt, status, usuario, obs_status || null]);
    }

    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[canteiro/req-materiais/:id PUT]', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
