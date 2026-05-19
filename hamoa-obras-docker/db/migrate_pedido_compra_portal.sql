-- ============================================================
-- Migração: Pedido de Compra pelo Portal do Fornecedor
-- Construtivo AI — Portal Fornecedor / Canteiro
--
-- Execute:
--   cat db/migrate_pedido_compra_portal.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

-- ── Extensão da tabela req_materiais ─────────────────────────
-- Identifica a origem do pedido: encarregado interno ou fornecedor via portal
ALTER TABLE req_materiais
  ADD COLUMN IF NOT EXISTS origem        VARCHAR(30) NOT NULL DEFAULT 'encarregado',
  ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contrato_id   INTEGER REFERENCES contratos(id)    ON DELETE SET NULL;

-- Índices para os novos campos
CREATE INDEX IF NOT EXISTS idx_req_mat_origem       ON req_materiais(origem);
CREATE INDEX IF NOT EXISTS idx_req_mat_fornecedor   ON req_materiais(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_contrato     ON req_materiais(contrato_id);

-- ── Configuração global: Portal Pedido de Compra ─────────────
INSERT INTO configuracoes (chave, valor)
VALUES ('portal_pedido_compra', '{"ativo": false}'::jsonb)
ON CONFLICT (chave) DO NOTHING;
