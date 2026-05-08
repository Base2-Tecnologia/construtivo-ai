/**
 * CONSTRUTIVO OBRAS — Rotas de Requisição de Compra (RDC)
 *
 * GET    /api/rdcs                    → lista com filtros
 * POST   /api/rdcs                    → cria nova RDC
 * GET    /api/rdcs/stats              → KPIs do dashboard de suprimentos
 * GET    /api/rdcs/:id                → detalhe completo (itens + histórico + anexos)
 * PUT    /api/rdcs/:id                → atualiza campos da RDC
 * PUT    /api/rdcs/:id/status         → avança/retrocede status + registra histórico
 * POST   /api/rdcs/:id/itens          → adiciona item de material
 * PUT    /api/rdcs/:id/itens/:iid     → atualiza item
 * DELETE /api/rdcs/:id/itens/:iid     → remove item
 * POST   /api/rdcs/:id/comentario     → adiciona comentário ao histórico
 * POST   /api/rdcs/:id/vincular       → vincula contrato existente e fecha RDC
 * POST   /api/rdcs/:id/anexos         → upload de anexo (multipart)
 * GET    /api/rdcs/:id/anexos         → lista anexos com URL de visualização
 * DELETE /api/rdcs/:id/anexos/:aid    → remove anexo
 */
'use strict';

const path   = require('path');
const multer = require('multer');
const router  = require('express').Router();
const db      = require('../db');
const auth    = require('../middleware/auth');
const { perm } = require('../middleware/perm');
const { getObrasPermitidas } = require('../middleware/obras');
const sendMail = require('../helpers/email').sendMail;
const { sendText, _fmtTel } = require('../helpers/whatsapp');
const storageHelper = require('../helpers/storage');

// ── Multer: grava temporariamente em /app/uploads ─────────────
const _multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/app/uploads'),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = Date.now() + '-' + Math.random().toString(36).slice(2);
    cb(null, base + ext);
  },
});
const _upload = multer({
  storage: _multerStorage,
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB por arquivo
});

// ── Status permitidos e fluxo ─────────────────────────────────
const STATUS_LABEL = {
  rascunho:             '📝 Rascunho',
  aguardando_aprovacao: '⏳ Aguardando aprovação',
  aprovada:             '✅ Aprovada',
  em_processo:          '🔄 Em processo',
  contratada:           '🔵 Contratada',
  cancelada:            '❌ Cancelada',
};

// ── Helper: registra evento no histórico ─────────────────────
async function _hist(client, rdcId, tipo, anterior, novo, comentario, usuario) {
  await client.query(
    `INSERT INTO rdc_historico (rdc_id, tipo, status_anterior, status_novo, comentario, usuario)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [rdcId, tipo, anterior || null, novo || null, comentario || null, usuario]
  );
}

// ── Helper: busca RDC completa ────────────────────────────────
async function _getRdc(id) {
  const r = await db.query(
    `SELECT r.*,
            o.nome AS obra_nome,
            o.empresa_id,
            e.nome_fantasia AS empresa_nome,
            a.nome AS atividade_nome,
            a.wbs  AS atividade_wbs,
            c.numero AS contrato_numero,
            c.valor_total AS contrato_valor
       FROM rdcs r
       LEFT JOIN obras o ON o.id = r.obra_id
       LEFT JOIN empresas e ON e.id = o.empresa_id
       LEFT JOIN atividades_cronograma a ON a.id = r.atividade_id
       LEFT JOIN contratos c ON c.id = r.contrato_id
      WHERE r.id = $1`,
    [parseInt(id)]
  );
  return r.rows[0] || null;
}

// ── Notificação ao responsável ────────────────────────────────
async function _notificarResponsavel(rdc, acao) {
  if (!rdc.responsavel) return;
  try {
    // Busca dados do responsável
    const uR = await db.query(
      `SELECT nome, email, telefone FROM usuarios WHERE login=$1 AND ativo=true`,
      [rdc.responsavel]
    );
    const u = uR.rows[0];
    if (!u) return;

    const prazoFmt = rdc.data_prazo
      ? new Date(rdc.data_prazo).toLocaleDateString('pt-BR')
      : '—';

    const msgWa = `🏗️ *CONSTRUTIVO AI — Suprimentos*
━━━━━━━━━━━━━━━━━━━━
📋 *${acao}*

*RDC:* ${rdc.codigo}
*Obra:* ${rdc.obra_nome || '—'}
*Título:* ${rdc.titulo}
*Prazo:* ${prazoFmt}
${rdc.valor_estimado ? `*Valor Est.:* R$ ${parseFloat(rdc.valor_estimado).toLocaleString('pt-BR', {minimumFractionDigits:2})}` : ''}

Acesse o Construtivo para ver os detalhes e itens da RDC.`;

    const htmlEmail = `<div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#1e3a5f">🏗️ Construtivo AI — ${acao}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px;color:#666">RDC</td><td style="padding:6px;font-weight:bold">${rdc.codigo}</td></tr>
        <tr style="background:#f5f5f5"><td style="padding:6px;color:#666">Obra</td><td style="padding:6px">${rdc.obra_nome || '—'}</td></tr>
        <tr><td style="padding:6px;color:#666">Título</td><td style="padding:6px">${rdc.titulo}</td></tr>
        <tr style="background:#f5f5f5"><td style="padding:6px;color:#666">Prazo</td><td style="padding:6px;font-weight:bold;color:${rdc.data_prazo?'#c00':'#333'}">${prazoFmt}</td></tr>
        ${rdc.valor_estimado ? `<tr><td style="padding:6px;color:#666">Valor Est.</td><td style="padding:6px">R$ ${parseFloat(rdc.valor_estimado).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>` : ''}
      </table>
      <p style="margin-top:20px;color:#666;font-size:13px">Acesse o Construtivo para ver os detalhes, itens de material e dar andamento à RDC.</p>
    </div>`;

    // Email
    if (u.email) {
      await sendMail(u.email, `[Construtivo] ${acao} — ${rdc.codigo}`, htmlEmail).catch(e =>
        console.warn('[RDC] Email falhou:', e.message)
      );
    }

    // WhatsApp
    if (u.telefone) {
      const cfg = (await db.query("SELECT valor FROM configuracoes WHERE chave='whatsapp'")).rows[0]?.valor || {};
      if (cfg.ativo) {
        await sendText(cfg, u.telefone, msgWa).catch(e =>
          console.warn('[RDC] WhatsApp falhou:', e.message)
        );
      }
    }
  } catch (e) {
    console.warn('[RDC] Notificação falhou (não crítico):', e.message);
  }
}

// ════════════════════════════════════════════════════════════════
// GET /api/rdcs/stats — KPIs para o dashboard
// ════════════════════════════════════════════════════════════════
router.get('/stats', auth, async (req, res) => {
  try {
    const obras = await getObrasPermitidas(req, db);
    const params = [];
    let obraWhere = '';
    if (obras) {
      params.push(obras);
      obraWhere = `AND obra_id = ANY($${params.length}::int[])`;
    }

    const r = await db.query(`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(*) FILTER (WHERE status='rascunho')                  AS rascunho,
        COUNT(*) FILTER (WHERE status='aguardando_aprovacao')      AS aguardando,
        COUNT(*) FILTER (WHERE status='aprovada')                  AS aprovada,
        COUNT(*) FILTER (WHERE status='em_processo')               AS em_processo,
        COUNT(*) FILTER (WHERE status='contratada')                AS contratada,
        COUNT(*) FILTER (WHERE status='cancelada')                 AS cancelada,
        COUNT(*) FILTER (WHERE status NOT IN ('contratada','cancelada')
                           AND data_prazo < NOW())                 AS vencidas,
        COUNT(*) FILTER (WHERE status NOT IN ('contratada','cancelada')
                           AND data_prazo BETWEEN NOW() AND NOW() + INTERVAL '7 days') AS vencendo_7d
      FROM rdcs
      WHERE 1=1 ${obraWhere}
    `, params);

    // Top responsáveis com mais RDCs abertas
    const respR = await db.query(`
      SELECT responsavel_nome AS nome, responsavel AS login,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status NOT IN ('contratada','cancelada')) AS abertas
        FROM rdcs
       WHERE responsavel IS NOT NULL ${obraWhere}
       GROUP BY responsavel_nome, responsavel
       ORDER BY abertas DESC
       LIMIT 5
    `, params);

    res.json({ ...r.rows[0], responsaveis: respR.rows });
  } catch (e) {
    console.error('[RDC/stats]', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/rdcs — lista com filtros
// ════════════════════════════════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const obras = await getObrasPermitidas(req, db);
    const params = [];
    const wheres = ['1=1'];

    if (obras) {
      params.push(obras);
      wheres.push(`r.obra_id = ANY($${params.length}::int[])`);
    }
    if (req.query.obra_id) {
      params.push(parseInt(req.query.obra_id));
      wheres.push(`r.obra_id = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      wheres.push(`r.status = $${params.length}`);
    }
    if (req.query.responsavel) {
      params.push(req.query.responsavel);
      wheres.push(`r.responsavel = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      wheres.push(`(r.titulo ILIKE $${params.length} OR r.codigo ILIKE $${params.length} OR o.nome ILIKE $${params.length})`);
    }

    const r = await db.query(`
      SELECT r.id, r.codigo, r.titulo, r.status, r.responsavel, r.responsavel_nome,
             r.data_prazo, r.valor_estimado, r.criado_por, r.created_at, r.updated_at,
             r.obra_id, o.nome AS obra_nome, r.grupo_pai, r.wbs,
             r.atividade_id, r.contrato_id,
             (SELECT COUNT(*) FROM rdc_itens WHERE rdc_id = r.id) AS qtd_itens,
             (SELECT COUNT(*) FROM rdc_historico WHERE rdc_id = r.id) AS qtd_historico
        FROM rdcs r
        LEFT JOIN obras o ON o.id = r.obra_id
       WHERE ${wheres.join(' AND ')}
       ORDER BY
         CASE r.status
           WHEN 'aprovada'             THEN 1
           WHEN 'aguardando_aprovacao' THEN 2
           WHEN 'em_processo'          THEN 3
           WHEN 'rascunho'             THEN 4
           WHEN 'contratada'           THEN 5
           WHEN 'cancelada'            THEN 6
         END,
         r.data_prazo ASC NULLS LAST,
         r.created_at DESC
      LIMIT ${parseInt(req.query.limit) || 100}
    `, params);

    res.json(r.rows);
  } catch (e) {
    console.error('[RDC/list]', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/rdcs — cria RDC
// ════════════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const {
      titulo, obra_id, atividade_id, cronograma_id, grupo_pai, wbs,
      responsavel, responsavel_nome, data_prazo, valor_estimado, observacoes, itens,
    } = req.body;

    if (!titulo?.trim()) return res.status(400).json({ error: 'Título obrigatório.' });
    if (!obra_id)         return res.status(400).json({ error: 'obra_id obrigatório.' });

    const r = await client.query(`
      INSERT INTO rdcs (titulo, obra_id, atividade_id, cronograma_id, grupo_pai, wbs,
                        responsavel, responsavel_nome, data_prazo, valor_estimado,
                        observacoes, criado_por, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'rascunho')
      RETURNING *`,
      [titulo.trim(), obra_id, atividade_id||null, cronograma_id||null,
       grupo_pai||null, wbs||null, responsavel||null, responsavel_nome||null,
       data_prazo||null, valor_estimado||null, observacoes||null,
       req.user?.login || 'sistema']
    );
    const rdc = r.rows[0];

    // Insere itens se fornecidos
    if (Array.isArray(itens) && itens.length) {
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i];
        const tot = (parseFloat(it.quantidade)||0) * (parseFloat(it.custo_unitario)||0) || null;
        await client.query(
          `INSERT INTO rdc_itens (rdc_id, descricao, unidade, quantidade, custo_unitario, custo_total, especificacao, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rdc.id, it.descricao, it.unidade||'UN', it.quantidade||null,
           it.custo_unitario||null, tot, it.especificacao||null, i]
        );
      }
    }

    await _hist(client, rdc.id, 'status_change', null, 'rascunho', 'RDC criada.', req.user?.login);
    await client.query('COMMIT');

    // Notifica se já tem responsável
    const rdcFull = await _getRdc(rdc.id);
    if (responsavel) _notificarResponsavel(rdcFull, 'Nova RDC atribuída a você').catch(() => {});

    res.status(201).json(rdcFull);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[RDC/post]', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/rdcs/:id — detalhe completo
// ════════════════════════════════════════════════════════════════
router.get('/:id', auth, async (req, res) => {
  try {
    const rdc = await _getRdc(req.params.id);
    if (!rdc) return res.status(404).json({ error: 'RDC não encontrada.' });

    const [itensR, histR, anexosR] = await Promise.all([
      db.query(`SELECT * FROM rdc_itens    WHERE rdc_id=$1 ORDER BY ordem, id`,       [rdc.id]),
      db.query(`SELECT * FROM rdc_historico WHERE rdc_id=$1 ORDER BY created_at DESC`, [rdc.id]),
      db.query(`SELECT * FROM rdc_anexos   WHERE rdc_id=$1 ORDER BY created_at`,       [rdc.id]),
    ]);

    // Gera URLs de visualização para cada anexo
    const anexos = await Promise.all(anexosR.rows.map(async a => ({
      ...a,
      url_view: await storageHelper.getViewUrl(a),
    })));

    res.json({ ...rdc, itens: itensR.rows, historico: histR.rows, anexos });
  } catch (e) {
    console.error('[RDC/get]', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PUT /api/rdcs/:id — atualiza campos
// ════════════════════════════════════════════════════════════════
router.put('/:id', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const id = parseInt(req.params.id);
    const { titulo, responsavel, responsavel_nome, data_prazo, valor_estimado, observacoes } = req.body;

    const before = await _getRdc(id);
    if (!before) return res.status(404).json({ error: 'RDC não encontrada.' });

    await client.query(`
      UPDATE rdcs SET
        titulo=$1, responsavel=$2, responsavel_nome=$3,
        data_prazo=$4, valor_estimado=$5, observacoes=$6
      WHERE id=$7`,
      [titulo||before.titulo, responsavel||null, responsavel_nome||null,
       data_prazo||null, valor_estimado||null, observacoes||null, id]
    );

    // Se responsável mudou, notifica
    if (responsavel && responsavel !== before.responsavel) {
      await _hist(client, id, 'atribuicao', null, null,
        `Atribuída a ${responsavel_nome || responsavel}`, req.user?.login);
    }

    await client.query('COMMIT');
    const updated = await _getRdc(id);
    if (responsavel && responsavel !== before.responsavel)
      _notificarResponsavel(updated, 'RDC atribuída a você').catch(() => {});

    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════
// PUT /api/rdcs/:id/status — muda status
// ════════════════════════════════════════════════════════════════
router.put('/:id/status', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const id     = parseInt(req.params.id);
    const { status, comentario } = req.body;

    if (!STATUS_LABEL[status]) return res.status(400).json({ error: `Status inválido: ${status}` });

    const rdc = await _getRdc(id);
    if (!rdc) return res.status(404).json({ error: 'RDC não encontrada.' });

    const extraFields = {};
    if (status === 'aprovada')    extraFields.data_aprovacao = 'NOW()';
    if (status === 'contratada')  extraFields.data_contratacao = 'NOW()';

    const setExtra = Object.keys(extraFields).map(k => `${k}=${extraFields[k]}`).join(',');
    await client.query(
      `UPDATE rdcs SET status=$1 ${setExtra ? ','+setExtra : ''} WHERE id=$2`,
      [status, id]
    );

    await _hist(client, id, 'status_change', rdc.status, status,
      comentario || `Status alterado para ${STATUS_LABEL[status]}`, req.user?.login);

    await client.query('COMMIT');
    const updated = await _getRdc(id);

    // Notifica responsável da mudança de status
    const acaoMap = {
      aprovada: 'RDC aprovada — aguardando sua ação',
      em_processo: 'RDC em processo — atualização de status',
      contratada: 'RDC concluída — contrato vinculado',
      cancelada: 'RDC cancelada',
    };
    if (acaoMap[status]) _notificarResponsavel(updated, acaoMap[status]).catch(() => {});

    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════
// POST /api/rdcs/:id/itens — adiciona item
// ════════════════════════════════════════════════════════════════
router.post('/:id/itens', auth, async (req, res) => {
  try {
    const rdcId = parseInt(req.params.id);
    const { descricao, unidade, quantidade, custo_unitario, especificacao } = req.body;
    if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição obrigatória.' });
    const tot = (parseFloat(quantidade)||0) * (parseFloat(custo_unitario)||0) || null;
    const r = await db.query(`
      INSERT INTO rdc_itens (rdc_id, descricao, unidade, quantidade, custo_unitario, custo_total, especificacao, ordem)
      SELECT $1,$2,$3,$4,$5,$6,$7, COALESCE(MAX(ordem)+1,0) FROM rdc_itens WHERE rdc_id=$1
      RETURNING *`,
      [rdcId, descricao.trim(), unidade||'UN', quantidade||null, custo_unitario||null, tot, especificacao||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// PUT /api/rdcs/:id/itens/:iid — atualiza item
// ════════════════════════════════════════════════════════════════
router.put('/:id/itens/:iid', auth, async (req, res) => {
  try {
    const { descricao, unidade, quantidade, custo_unitario, especificacao } = req.body;
    const tot = (parseFloat(quantidade)||0) * (parseFloat(custo_unitario)||0) || null;
    const r = await db.query(`
      UPDATE rdc_itens SET descricao=$1,unidade=$2,quantidade=$3,custo_unitario=$4,custo_total=$5,especificacao=$6
      WHERE id=$7 AND rdc_id=$8 RETURNING *`,
      [descricao, unidade||'UN', quantidade||null, custo_unitario||null, tot, especificacao||null,
       parseInt(req.params.iid), parseInt(req.params.id)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Item não encontrado.' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// DELETE /api/rdcs/:id/itens/:iid
// ════════════════════════════════════════════════════════════════
router.delete('/:id/itens/:iid', auth, async (req, res) => {
  try {
    await db.query(`DELETE FROM rdc_itens WHERE id=$1 AND rdc_id=$2`,
      [parseInt(req.params.iid), parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// POST /api/rdcs/:id/comentario
// ════════════════════════════════════════════════════════════════
router.post('/:id/comentario', auth, async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario?.trim()) return res.status(400).json({ error: 'Comentário vazio.' });
    await db.query(
      `INSERT INTO rdc_historico (rdc_id, tipo, comentario, usuario) VALUES ($1,'comentario',$2,$3)`,
      [parseInt(req.params.id), comentario.trim(), req.user?.login]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// POST /api/rdcs/:id/vincular — vincula contrato e fecha RDC
// ════════════════════════════════════════════════════════════════
router.post('/:id/vincular', auth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rdcId     = parseInt(req.params.id);
    const contratoId = parseInt(req.body.contrato_id);
    if (!contratoId) return res.status(400).json({ error: 'contrato_id obrigatório.' });

    const rdc = await _getRdc(rdcId);
    if (!rdc) return res.status(404).json({ error: 'RDC não encontrada.' });

    // Vincula atividade ao contrato se existir e ainda não estiver
    if (rdc.atividade_id) {
      await client.query(`
        INSERT INTO contratos_atividades (contrato_id, atividade_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [contratoId, rdc.atividade_id]
      );
    }

    await client.query(
      `UPDATE rdcs SET contrato_id=$1, status='contratada', data_contratacao=NOW() WHERE id=$2`,
      [contratoId, rdcId]
    );
    await _hist(client, rdcId, 'status_change', rdc.status, 'contratada',
      `Contrato vinculado. RDC encerrada.`, req.user?.login);

    await client.query('COMMIT');
    const updated = await _getRdc(rdcId);
    _notificarResponsavel(updated, 'RDC concluída — contrato vinculado').catch(() => {});
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════
// POST /api/rdcs/:id/anexos — upload de arquivo (multipart, até 10 por vez)
// ════════════════════════════════════════════════════════════════
router.post('/:id/anexos', auth, _upload.array('files', 10), async (req, res) => {
  const rdcId = parseInt(req.params.id);
  if (!req.files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  const salvos = [];
  try {
    for (const file of req.files) {
      // Classifica tipo
      const mime = file.mimetype || '';
      let tipo = 'other';
      if (mime.startsWith('image/'))                 tipo = 'img';
      else if (mime === 'application/pdf')            tipo = 'pdf';
      else if (mime.includes('word') || mime.includes('document')) tipo = 'doc';
      else if (mime.includes('sheet') || mime.includes('excel'))   tipo = 'doc';

      // Tamanho legível
      const bytes = file.size || 0;
      const tamanho = bytes < 1024 ? `${bytes} B`
        : bytes < 1024 * 1024 ? `${(bytes/1024).toFixed(1)} KB`
        : `${(bytes/1024/1024).toFixed(1)} MB`;

      // Envia para o provider configurado (S3 / GDrive / local)
      let result = { provider: 'local', caminho: file.filename, url_storage: null };
      try {
        result = await storageHelper.uploadFile(file.path, file.originalname, file.mimetype);
      } catch (e) {
        console.error('[rdc/anexos upload] storage error:', e.message);
      }

      // Remove temporário se foi para cloud
      if (result.provider !== 'local') {
        const fs = require('fs');
        try { fs.unlinkSync(file.path); } catch {}
      }

      const r = await db.query(
        `INSERT INTO rdc_anexos (rdc_id, nome, tipo, tamanho, caminho, provider, url_storage, enviado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [rdcId, file.originalname, tipo, tamanho,
         result.caminho, result.provider, result.url_storage || null,
         req.user?.login || 'sistema']
      );
      const ev = r.rows[0];
      ev.url_view = await storageHelper.getViewUrl(ev);
      salvos.push(ev);
    }

    // Registra no histórico
    await db.query(
      `INSERT INTO rdc_historico (rdc_id, tipo, comentario, usuario)
       VALUES ($1,'comentario',$2,$3)`,
      [rdcId,
       `📎 ${salvos.length} anexo(s) adicionado(s): ${salvos.map(a => a.nome).join(', ')}`,
       req.user?.login]
    );

    res.status(201).json(salvos);
  } catch (e) {
    console.error('[rdc/anexos]', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/rdcs/:id/anexos — lista com URL de visualização
// ════════════════════════════════════════════════════════════════
router.get('/:id/anexos', auth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM rdc_anexos WHERE rdc_id=$1 ORDER BY created_at`,
      [parseInt(req.params.id)]
    );
    const com_url = await Promise.all(rows.rows.map(async ev => ({
      ...ev,
      url_view: await storageHelper.getViewUrl(ev),
    })));
    res.json(com_url);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DELETE /api/rdcs/:id/anexos/:aid
// ════════════════════════════════════════════════════════════════
router.delete('/:id/anexos/:aid', auth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM rdc_anexos WHERE id=$1 AND rdc_id=$2`,
      [parseInt(req.params.aid), parseInt(req.params.id)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Anexo não encontrado.' });
    await storageHelper.deleteFile(r.rows[0]);
    await db.query(`DELETE FROM rdc_anexos WHERE id=$1`, [parseInt(req.params.aid)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
