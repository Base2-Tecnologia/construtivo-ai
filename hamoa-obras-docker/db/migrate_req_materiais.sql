-- ============================================================
-- Migração: Módulo de Requisição de Material (Canteiro)
-- Construtivo AI — Canteiro / Suprimentos
--
-- Execute:
--   cat db/migrate_req_materiais.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

-- ── Requisições de Material (tabela principal) ────────────────
CREATE TABLE IF NOT EXISTS req_materiais (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(20) UNIQUE,                -- gerado automaticamente: RM-2025-0001

  -- Origem
  atividade_id    INTEGER REFERENCES atividades_cronograma(id) ON DELETE SET NULL,
  cronograma_id   INTEGER REFERENCES cronogramas(id)           ON DELETE SET NULL,
  obra_id         INTEGER REFERENCES obras(id)                 ON DELETE CASCADE,

  -- Conteúdo
  descricao       VARCHAR(500) NOT NULL,             -- nome do material/item
  quantidade      NUMERIC(12,3),
  unidade         VARCHAR(50),                       -- un, m², m³, kg, cx, etc.
  observacao      TEXT,

  -- Status do fluxo
  -- pendente → em_compra → entregue | cancelado
  status          VARCHAR(50) NOT NULL DEFAULT 'pendente',

  -- Responsabilidades
  criado_por      VARCHAR(200),                      -- login do encarregado
  criado_por_nome VARCHAR(300),
  atendido_por    VARCHAR(200),                      -- login suprimentos que atendeu

  -- Datas
  data_necessidade DATE,                             -- data em que o material é necessário (= data_inicio da atividade)
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Gerador de código RM-YYYY-NNNN ───────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_req_materiais_codigo START 1;

CREATE OR REPLACE FUNCTION gerar_codigo_rm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'RM-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                  LPAD(NEXTVAL('seq_req_materiais_codigo')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_codigo_rm ON req_materiais;
CREATE TRIGGER trg_gerar_codigo_rm
  BEFORE INSERT ON req_materiais
  FOR EACH ROW EXECUTE FUNCTION gerar_codigo_rm();

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_req_mat_obra_id      ON req_materiais(obra_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_atividade_id ON req_materiais(atividade_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_status       ON req_materiais(status);
CREATE INDEX IF NOT EXISTS idx_req_mat_criado_por   ON req_materiais(criado_por);

-- ── Histórico de status ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS req_materiais_historico (
  id           SERIAL PRIMARY KEY,
  rm_id        INTEGER NOT NULL REFERENCES req_materiais(id) ON DELETE CASCADE,
  status_de    VARCHAR(50),
  status_para  VARCHAR(50) NOT NULL,
  observacao   TEXT,
  usuario      VARCHAR(200),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_hist_rm_id ON req_materiais_historico(rm_id);
