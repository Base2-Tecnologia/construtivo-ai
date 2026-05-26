-- ================================================================
-- CONSTRUTIVO OBRAS — Migração Consolidada
-- Período: 19/05/2026 a 26/05/2026 (últimos 7 dias)
--
-- Ordem de aplicação (respeita dependências entre tabelas):
--   1.  Cadastro de Insumos                           (19/05)
--   2.  UAU: código da empresa em empresas            (21/05)
--   3.  UAU: CAP no cadastro de insumos               (21/05)
--   4.  UAU: vínculos de planejamento por contrato    (21/05)
--   5.  UAU: número do pedido em req_materiais        (21/05)
--   6.  VIEW v_contrato_progresso                     (23/05)
--   7.  UAU: código do fornecedor em fornecedores     (23/05)
--   8.  Fornecedor: emails_copia (CC)                 (23/05)
--
-- NOTA: Todos os comandos usam IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- para serem idempotentes — seguro reaplicar se parte já foi aplicada.
--
-- Como aplicar:
--   cat db/migrate_ultimos_7_dias_20260526.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ================================================================


-- ================================================================
-- 1. Cadastro de Insumos                                (19/05)
-- ================================================================

CREATE TABLE IF NOT EXISTS insumos (
  id         SERIAL PRIMARY KEY,
  codigo     TEXT NOT NULL,
  nome       TEXT NOT NULL,
  unidade    TEXT NOT NULL DEFAULT '',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por TEXT,
  CONSTRAINT insumos_codigo_unico UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_insumos_codigo ON insumos (codigo);
CREATE INDEX IF NOT EXISTS idx_insumos_nome   ON insumos (LOWER(nome));

COMMENT ON TABLE  insumos IS 'Cadastro de insumos/materiais com código, nome e unidade';
COMMENT ON COLUMN insumos.codigo     IS 'Código único do insumo (ex: INS-001)';
COMMENT ON COLUMN insumos.nome       IS 'Descrição/nome do insumo';
COMMENT ON COLUMN insumos.unidade    IS 'Unidade de medida (ex: UN, KG, M²)';
COMMENT ON COLUMN insumos.criado_por IS 'Login do usuário que criou o registro';


-- ================================================================
-- 2. UAU: código da empresa na tabela empresas          (21/05)
-- ================================================================

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS uau_empresa INTEGER;

COMMENT ON COLUMN empresas.uau_empresa IS
  'Código da empresa no ERP UAU — usado em pedidos de compra e integrações';


-- ================================================================
-- 3. UAU: CAP (Conta de Apropriação) no cadastro de insumos (21/05)
-- ================================================================

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS cap VARCHAR(50);

COMMENT ON COLUMN insumos.cap IS
  'Código de Conta de Apropriação — usado na integração UAU (GravarPedidoDeCompraDoTipoMaterial)';


-- ================================================================
-- 4. UAU: vínculos de planejamento (SI) por contrato    (21/05)
-- ================================================================

CREATE TABLE IF NOT EXISTS contrato_uau_vinculos (
  id               SERIAL PRIMARY KEY,
  contrato_id      INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  servico_pl       VARCHAR(100) NOT NULL,
  codigo_insumo_pl VARCHAR(100) NOT NULL,
  descricao        VARCHAR(255),
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cont_uau_vinculos_contrato
  ON contrato_uau_vinculos(contrato_id);

COMMENT ON TABLE contrato_uau_vinculos IS
  'Combinações (servicoPl, codigoInsumoPl) para integração UAU por contrato';

ALTER TABLE contrato_uau_vinculos
  ADD COLUMN IF NOT EXISTS codigo_insumo_servico_pl VARCHAR(100);

COMMENT ON COLUMN contrato_uau_vinculos.codigo_insumo_servico_pl IS
  'Código do insumo de serviço no Planejamento UAU — usado na integração ManterMedicao';


-- ================================================================
-- 5. UAU: número do pedido de compra em req_materiais   (21/05)
-- ================================================================

ALTER TABLE req_materiais
  ADD COLUMN IF NOT EXISTS uau_pedido_numero VARCHAR(50);

COMMENT ON COLUMN req_materiais.uau_pedido_numero IS
  'Número do pedido de compra gerado no ERP UAU após integração';


-- ================================================================
-- 6. VIEW v_contrato_progresso                          (23/05)
--    Centraliza cálculo de progresso financeiro, físico e
--    descompasso por contrato. Substitui queries duplicadas.
-- ================================================================

CREATE OR REPLACE VIEW v_contrato_progresso AS
SELECT
  c.id                              AS contrato_id,
  c.obra_id,
  c.empresa_id,
  c.valor_total,

  -- Financeiro: soma de medições Normal+Adiantamento não reprovadas
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

  -- % financeiro executado sobre o valor total do contrato
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

  -- Físico: maior pct_total das medições Normal+Avanco_Fisico aprovadas
  COALESCE(MAX(
    CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Avanco_Fisico')
              AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
         THEN m.pct_total ELSE NULL END
  ), 0)                             AS pct_fisico_acumulado,

  -- Adiantamentos
  COALESCE(SUM(
    CASE WHEN COALESCE(m.tipo,'Normal') = 'Adiantamento'
              AND m.status NOT IN ('Rascunho','Reprovado')
         THEN m.valor_medicao ELSE 0 END
  ), 0)                             AS total_adiantamentos,

  -- Descompasso (financeiro adiantado vs. físico executado)
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

  -- Contagens
  COUNT(DISTINCT m.id)                                                          AS total_medicoes,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'Aprovado')                    AS medicoes_aprovadas,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status NOT IN ('Rascunho','Reprovado')) AS medicoes_ativas

FROM contratos c
LEFT JOIN medicoes m ON m.contrato_id = c.id
GROUP BY c.id, c.obra_id, c.empresa_id, c.valor_total;

COMMENT ON VIEW v_contrato_progresso IS
  'Progresso financeiro, físico e descompasso por contrato. '
  'Fonte única de verdade — substitui queries duplicadas nos routes de contratos e medições.';


-- ================================================================
-- 7. UAU: código do fornecedor em fornecedores          (23/05)
-- ================================================================

ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS uau_codigo_fornecedor INTEGER;

COMMENT ON COLUMN fornecedores.uau_codigo_fornecedor
  IS 'Código interno do fornecedor no ERP UAU (CodigoFornecedor na API ManterMedicao)';


-- ================================================================
-- 8. Fornecedor: e-mails adicionais em cópia (CC)       (23/05)
-- ================================================================

ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS emails_copia TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN fornecedores.emails_copia IS
  'E-mails adicionais do fornecedor (CC). Substitui email_nf e email_assin no frontend.';

-- Migra dados existentes: popula emails_copia com email_nf e email_assin (sem duplicar o principal)
UPDATE fornecedores
SET emails_copia = (
  SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), '{}')
  FROM unnest(ARRAY[email_nf, email_assin]) AS e
  WHERE e IS NOT NULL
    AND e <> ''
    AND (email IS NULL OR e <> email)
)
WHERE email_nf IS NOT NULL OR email_assin IS NOT NULL;


-- ================================================================
-- FIM
-- ================================================================
SELECT 'Migração 19-26/05/2026 aplicada com sucesso.' AS resultado;
