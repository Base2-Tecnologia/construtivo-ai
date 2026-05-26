-- migrate_view_progresso.sql
-- VIEW v_contrato_progresso
-- Centraliza o cálculo de progresso financeiro, físico e descompasso por contrato.
-- Substitui queries duplicadas em api/routes/contratos.js e api/routes/medicoes.js.
-- Compatível com PostgreSQL 13+.

CREATE OR REPLACE VIEW v_contrato_progresso AS
SELECT
  c.id                              AS contrato_id,
  c.obra_id,
  c.empresa_id,
  c.valor_total,

  -- ── Financeiro ──────────────────────────────────────────────────────────────
  -- Soma de todas as medições Normais + Adiantamentos aprovadas/assinadas/concluídas
  COALESCE(SUM(
    CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Adiantamento')
              AND m.status NOT IN ('Rascunho','Reprovado')
         THEN m.valor_medicao ELSE 0 END
  ), 0)                             AS total_financeiro_medido,

  COALESCE(SUM(
    CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Adiantamento')
              AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
         THEN m.valor_medicao ELSE 0 END
  ), 0)                             AS total_financeiro_aprovado,

  -- % financeiro executado (aprovado) sobre o valor total do contrato
  CASE WHEN c.valor_total > 0
    THEN ROUND(LEAST(100,
      COALESCE(SUM(
        CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Adiantamento')
                  AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
             THEN m.valor_medicao ELSE 0 END
      ), 0) / c.valor_total * 100
    )::numeric, 2)
    ELSE 0
  END                               AS pct_executado_real,

  -- ── Físico ───────────────────────────────────────────────────────────────────
  -- Maior pct_total das medições físicas (Normal + Avanco_Fisico) aprovadas
  COALESCE(MAX(
    CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Avanco_Fisico')
              AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
         THEN m.pct_total ELSE NULL END
  ), 0)                             AS pct_fisico_acumulado,

  -- ── Adiantamentos ─────────────────────────────────────────────────────────
  COALESCE(SUM(
    CASE WHEN COALESCE(m.tipo,'Normal') = 'Adiantamento'
              AND m.status NOT IN ('Rascunho','Reprovado')
         THEN m.valor_medicao ELSE 0 END
  ), 0)                             AS total_adiantamentos,

  -- ── Descompasso (financeiro adiantado vs. físico executado) ──────────────
  CASE WHEN c.valor_total > 0
    THEN ROUND((
      COALESCE(SUM(
        CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Adiantamento')
                  AND m.status NOT IN ('Rascunho','Reprovado')
             THEN m.valor_medicao ELSE 0 END
      ), 0)
      - c.valor_total * COALESCE(MAX(
        CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Avanco_Fisico')
                  AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
             THEN m.pct_total END
      ), 0) / 100
    )::numeric, 2)
    ELSE 0
  END                               AS descompasso,

  -- ── Contagens ────────────────────────────────────────────────────────────
  COUNT(DISTINCT m.id)                                                          AS total_medicoes,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'Aprovado')                    AS medicoes_aprovadas,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status NOT IN ('Rascunho','Reprovado')) AS medicoes_ativas

FROM contratos c
LEFT JOIN medicoes m ON m.contrato_id = c.id
GROUP BY c.id, c.obra_id, c.empresa_id, c.valor_total;

COMMENT ON VIEW v_contrato_progresso IS
  'Progresso financeiro, físico e descompasso por contrato. '
  'Fonte única de verdade — substitui queries duplicadas nos routes de contratos e medições.';
