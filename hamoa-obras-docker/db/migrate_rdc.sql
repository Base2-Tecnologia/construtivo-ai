-- ============================================================
-- Migração: Módulo de Requisição de Compra (RDC)
-- Construtivo AI — Suprimentos
--
-- Execute:
--   cat db/migrate_rdc.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

-- ── Requisições de Compra (tabela principal) ──────────────────
CREATE TABLE IF NOT EXISTS rdcs (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(20) UNIQUE,           -- gerado automaticamente: RDC-2025-0001
  titulo          VARCHAR(500) NOT NULL,
  obra_id         INTEGER REFERENCES obras(id) ON DELETE CASCADE,
  atividade_id    INTEGER REFERENCES atividades_cronograma(id) ON DELETE SET NULL,
  cronograma_id   INTEGER REFERENCES cronogramas(id) ON DELETE SET NULL,
  grupo_pai       VARCHAR(500),                  -- nome do grupo do cronograma
  wbs             VARCHAR(100),

  -- Status do fluxo
  status          VARCHAR(50) NOT NULL DEFAULT 'rascunho',
  -- rascunho → aguardando_aprovacao → aprovada → em_processo → contratada | cancelada

  -- Responsabilidades
  criado_por      VARCHAR(200),
  responsavel     VARCHAR(200),                  -- login do responsável de suprimentos
  responsavel_nome VARCHAR(300),

  -- Datas
  data_prazo      DATE,                          -- prazo para contratar (do gatilho)
  data_aprovacao  TIMESTAMP,
  data_contratacao TIMESTAMP,

  -- Valores
  valor_estimado  NUMERIC(15,2),

  -- Vínculo com contrato (quando fechado)
  contrato_id     INTEGER REFERENCES contratos(id) ON DELETE SET NULL,

  observacoes     TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rdcs_obra     ON rdcs(obra_id);
CREATE INDEX IF NOT EXISTS idx_rdcs_status   ON rdcs(status);
CREATE INDEX IF NOT EXISTS idx_rdcs_atividade ON rdcs(atividade_id);
CREATE INDEX IF NOT EXISTS idx_rdcs_resp     ON rdcs(responsavel);

-- ── Itens de material da RDC ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rdc_itens (
  id              SERIAL PRIMARY KEY,
  rdc_id          INTEGER NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  descricao       VARCHAR(500) NOT NULL,
  unidade         VARCHAR(50)  DEFAULT 'UN',
  quantidade      NUMERIC(15,3),
  custo_unitario  NUMERIC(15,2),
  custo_total     NUMERIC(15,2),                 -- calculado no app (qtd * unit)
  especificacao   TEXT,                           -- detalhe técnico / link doc
  ordem           INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_itens_rdc ON rdc_itens(rdc_id);

-- ── Histórico de status e comentários ────────────────────────
CREATE TABLE IF NOT EXISTS rdc_historico (
  id              SERIAL PRIMARY KEY,
  rdc_id          INTEGER NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) DEFAULT 'comentario',  -- comentario | status_change | atribuicao
  status_anterior VARCHAR(50),
  status_novo     VARCHAR(50),
  comentario      TEXT,
  usuario         VARCHAR(200),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_hist_rdc ON rdc_historico(rdc_id);

-- ── Sequência para código automático ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS rdc_seq START 1;

-- ── Trigger: atualiza updated_at ──────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdcs_updated ON rdcs;
CREATE TRIGGER trg_rdcs_updated
  BEFORE UPDATE ON rdcs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Trigger: gera código RDC-YYYY-NNNN ────────────────────────
CREATE OR REPLACE FUNCTION gen_rdc_codigo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'RDC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('rdc_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdcs_codigo ON rdcs;
CREATE TRIGGER trg_rdcs_codigo
  BEFORE INSERT ON rdcs
  FOR EACH ROW EXECUTE FUNCTION gen_rdc_codigo();

SELECT 'Migration RDC aplicada com sucesso.' AS resultado;
