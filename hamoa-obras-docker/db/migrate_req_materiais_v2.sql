-- ============================================================
-- Migração v2: req_materiais — itens JSONB, wbs e anexos
-- Execute:
--   cat db/migrate_req_materiais_v2.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

-- Adiciona coluna de itens (array JSON) e wbs na tabela principal
ALTER TABLE req_materiais
  ADD COLUMN IF NOT EXISTS itens       JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS wbs         VARCHAR(100);

-- Tabela de anexos das requisições de material
CREATE TABLE IF NOT EXISTS req_materiais_anexos (
  id          SERIAL PRIMARY KEY,
  rm_id       INTEGER NOT NULL REFERENCES req_materiais(id) ON DELETE CASCADE,
  nome        VARCHAR(500) NOT NULL,
  tipo        VARCHAR(20)  NOT NULL DEFAULT 'other',  -- img | pdf | doc | other
  tamanho     VARCHAR(30),
  caminho     VARCHAR(1000),
  provider    VARCHAR(50)  NOT NULL DEFAULT 'local',
  url_storage TEXT,
  enviado_por VARCHAR(200),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_anx_rm_id ON req_materiais_anexos(rm_id);
