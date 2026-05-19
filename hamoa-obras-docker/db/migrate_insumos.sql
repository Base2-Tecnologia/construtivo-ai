-- ════════════════════════════════════════════════════════════
-- migrate_insumos.sql
-- Tabela de cadastro de insumos (materiais)
-- ════════════════════════════════════════════════════════════

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
COMMENT ON COLUMN insumos.codigo    IS 'Código único do insumo (ex: INS-001)';
COMMENT ON COLUMN insumos.nome      IS 'Descrição/nome do insumo';
COMMENT ON COLUMN insumos.unidade   IS 'Unidade de medida (ex: UN, KG, M²)';
COMMENT ON COLUMN insumos.criado_por IS 'Login do usuário que criou o registro';
