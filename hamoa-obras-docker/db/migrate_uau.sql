-- ============================================================
-- Migração UAU: campos de referência para integração com ERP
-- Execute:
--   cat db/migrate_uau.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

-- ── Obras: código da obra e obra fiscal no UAU ───────────────
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS uau_obra         VARCHAR(30),
  ADD COLUMN IF NOT EXISTS uau_obra_fiscal  VARCHAR(30);

-- ── Contratos: empresa e número do contrato no UAU ──────────
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS uau_empresa  INTEGER,
  ADD COLUMN IF NOT EXISTS uau_contrato INTEGER;

-- ── Itens de contrato: item e código de acompanhamento UAU ──
ALTER TABLE contrato_itens
  ADD COLUMN IF NOT EXISTS uau_item                   INTEGER,
  ADD COLUMN IF NOT EXISTS uau_codigo_acompanhamento  INTEGER;

-- ── Medições: IDs de retorno após integração ─────────────────
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS uau_medicao_id   INTEGER,
  ADD COLUMN IF NOT EXISTS uau_processo_id  INTEGER,
  ADD COLUMN IF NOT EXISTS uau_integrado_em TIMESTAMPTZ;

-- ── Configuração global UAU (armazenada em chave JSON) ───────
-- Não cria tabela nova — usa a tabela `configuracoes` existente
-- Estrutura do valor:
-- {
--   "api_url":       "https://uau.web.jmdurbanismo.com.br/uauAPI",
--   "api_key":       "SUA_CHAVE_AQUI",
--   "api_versao":    "1",
--   "empresa_codigo": 1
-- }
INSERT INTO configuracoes (chave, valor) VALUES (
  'uau',
  '{
    "api_url": "",
    "api_key": "",
    "api_versao": "1",
    "empresa_codigo": null,
    "ativo": false
  }'::jsonb
) ON CONFLICT (chave) DO NOTHING;

COMMENT ON COLUMN obras.uau_obra        IS 'Código da obra no ERP UAU (Senior/Globaltec)';
COMMENT ON COLUMN obras.uau_obra_fiscal IS 'Código da obra fiscal no ERP UAU';
COMMENT ON COLUMN contratos.uau_empresa  IS 'Código da empresa no ERP UAU';
COMMENT ON COLUMN contratos.uau_contrato IS 'Número do contrato no ERP UAU';
COMMENT ON COLUMN contrato_itens.uau_item                  IS 'Número do item no contrato UAU';
COMMENT ON COLUMN contrato_itens.uau_codigo_acompanhamento IS 'Código do acompanhamento/serviço no UAU';
COMMENT ON COLUMN medicoes.uau_medicao_id  IS 'ID da medição gerada no ERP UAU após integração';
COMMENT ON COLUMN medicoes.uau_processo_id IS 'ID do processo de pagamento gerado no ERP UAU';
