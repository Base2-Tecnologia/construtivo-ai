/**
 * CONSTRUTIVO OBRAS — Rotas de Insumos
 *
 * GET    /api/insumos          → lista todos (suporta ?q=busca)
 * POST   /api/insumos          → cria insumo
 * PUT    /api/insumos/:id      → atualiza insumo
 * DELETE /api/insumos/:id      → remove insumo
 * POST   /api/insumos/bulk     → importação em massa (array de objetos)
 */
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { perm } = require('../middleware/perm');
const audit  = require('../middleware/audit');

// ── GET /api/insumos ───────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const q = req.query.q?.trim() || '';
    let rows;
    if (q) {
      rows = (await db.query(
        `SELECT * FROM insumos WHERE codigo ILIKE $1 OR nome ILIKE $1 ORDER BY codigo`,
        [`%${q}%`]
      )).rows;
    } else {
      rows = (await db.query('SELECT * FROM insumos ORDER BY codigo')).rows;
    }
    res.json(rows);
  } catch (err) {
    console.error('[insumos GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/insumos/bulk — DEVE vir antes do /:id ────────────────
router.post('/bulk', auth, perm('cadastros'), async (req, res) => {
  const registros = req.body;
  if (!Array.isArray(registros) || registros.length === 0)
    return res.status(400).json({ error: 'Envie um array de registros.' });

  const usuario = req.user?.login || req.user?.email || 'sistema';
  const resultados = [];

  for (let i = 0; i < registros.length; i++) {
    const { codigo, nome, unidade, cap } = registros[i];
    const linha = i + 2; // linha 1 = cabeçalho
    if (!codigo?.trim() || !nome?.trim()) {
      resultados.push({ linha, status: 'erro', motivo: 'Código e Nome são obrigatórios', codigo });
      continue;
    }
    try {
      const r = await db.query(
        `INSERT INTO insumos (codigo, nome, unidade, cap, criado_por)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (codigo) DO UPDATE
           SET nome    = EXCLUDED.nome,
               unidade = EXCLUDED.unidade,
               cap     = COALESCE(EXCLUDED.cap, insumos.cap)
         RETURNING id, codigo`,
        [codigo.trim(), nome.trim(), (unidade || '').trim(), cap?.trim() || null, usuario]
      );
      resultados.push({ linha, status: 'ok', id: r.rows[0].id, codigo: r.rows[0].codigo });
    } catch (e) {
      resultados.push({ linha, status: 'erro', motivo: e.detail || e.message, codigo });
    }
  }

  const ok    = resultados.filter(r => r.status === 'ok').length;
  const erros = resultados.filter(r => r.status === 'erro').length;
  await audit(req, 'criar', 'insumos', null, `Importação em massa: ${ok} ok, ${erros} erros`);
  res.json({ total: registros.length, importados: ok, erros, resultados });
});

// ── POST /api/insumos ──────────────────────────────────────────────
router.post('/', auth, perm('cadastros'), async (req, res) => {
  try {
    const { codigo, nome, unidade, cap } = req.body;
    if (!codigo?.trim() || !nome?.trim())
      return res.status(400).json({ error: 'Código e Nome são obrigatórios.' });

    const usuario = req.user?.login || req.user?.email || 'sistema';
    const r = await db.query(
      `INSERT INTO insumos (codigo, nome, unidade, cap, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [codigo.trim(), nome.trim(), (unidade || '').trim(), cap?.trim() || null, usuario]
    );
    const row = r.rows[0];
    await audit(req, 'criar', 'insumo', row.id, `Insumo "${row.codigo} — ${row.nome}" criado`);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Código "${req.body.codigo}" já existe.` });
    console.error('[insumos POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/insumos/:id ───────────────────────────────────────────
router.put('/:id', auth, perm('cadastros'), async (req, res) => {
  try {
    const { codigo, nome, unidade, cap } = req.body;
    if (!codigo?.trim() || !nome?.trim())
      return res.status(400).json({ error: 'Código e Nome são obrigatórios.' });

    const r = await db.query(
      `UPDATE insumos SET codigo=$1, nome=$2, unidade=$3, cap=$4 WHERE id=$5 RETURNING *`,
      [codigo.trim(), nome.trim(), (unidade || '').trim(), cap?.trim() || null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Insumo não encontrado.' });
    const row = r.rows[0];
    await audit(req, 'editar', 'insumo', row.id, `Insumo "${row.codigo} — ${row.nome}" atualizado`);
    res.json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Código "${req.body.codigo}" já existe.` });
    console.error('[insumos PUT]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/insumos/:id ────────────────────────────────────────
router.delete('/:id', auth, perm('cadastros'), async (req, res) => {
  try {
    const prev = await db.query('SELECT codigo, nome FROM insumos WHERE id=$1', [req.params.id]);
    if (!prev.rows[0]) return res.status(404).json({ error: 'Insumo não encontrado.' });
    await db.query('DELETE FROM insumos WHERE id=$1', [req.params.id]);
    await audit(req, 'excluir', 'insumo', parseInt(req.params.id),
      `Insumo "${prev.rows[0].codigo} — ${prev.rows[0].nome}" excluído`);
    res.status(204).end();
  } catch (err) {
    console.error('[insumos DELETE]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
