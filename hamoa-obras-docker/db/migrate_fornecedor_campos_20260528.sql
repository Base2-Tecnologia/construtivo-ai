-- Migration: adiciona campos fiscais ao fornecedor e remove email_assin
-- Data: 2026-05-28

BEGIN;

-- Novos campos fiscais / UAU
ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS cep                TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_estadual  TEXT,
  ADD COLUMN IF NOT EXISTS cnae                TEXT,
  ADD COLUMN IF NOT EXISTS optante_simples     BOOLEAN NOT NULL DEFAULT false;

-- Remove email_assin (não utilizado — assinatura eletrônica desativada)
ALTER TABLE fornecedores DROP COLUMN IF EXISTS email_assin;

COMMIT;
