-- ================================================================
-- CONSTRUTIVO OBRAS — Schema Completo (deploy do zero)
-- Gerado em: 26/05/2026
--
-- Este arquivo define o estado ATUAL completo do banco.
-- Use-o para novos ambientes — não precisa aplicar migrações avulsas.
--
-- Aplicação automática via Docker (fresh install):
--   O compose já monta este arquivo em /docker-entrypoint-initdb.d/
--   e o PostgreSQL o executa automaticamente quando o volume está vazio.
--
-- Aplicação manual (banco já existente):
--   cat db/schema_completo.sql | docker compose exec -T construtivo-db \
--     psql -U construtivo -d construtivo_obras
--
-- NOTA: Todos os comandos são idempotentes (IF NOT EXISTS / OR REPLACE).
-- ================================================================

-- ── Extensões ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ================================================================
-- TABELAS BASE
-- ================================================================

-- ── Empresas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id            SERIAL PRIMARY KEY,
  razao_social  VARCHAR(200) NOT NULL,
  nome_fantasia VARCHAR(200),
  cnpj          VARCHAR(20)  NOT NULL UNIQUE,
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  DEFAULT NOW(),
  -- UAU ERP (21/05/2026)
  uau_empresa   INTEGER
);

COMMENT ON COLUMN empresas.uau_empresa IS
  'Código da empresa no ERP UAU — usado em pedidos de compra e integrações';


-- ── Obras ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obras (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER      NOT NULL REFERENCES empresas(id),
  codigo        VARCHAR(20)  NOT NULL UNIQUE,
  nome          VARCHAR(200) NOT NULL,
  localizacao   VARCHAR(200),
  gestor        VARCHAR(150),
  status        VARCHAR(50)  NOT NULL DEFAULT 'Em andamento'
                CHECK (status IN ('Em andamento','Concluído','Paralisado')),
  criado_em     TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  DEFAULT NOW(),
  -- UAU ERP
  uau_obra       VARCHAR(30),
  uau_obra_fiscal VARCHAR(30)
);

COMMENT ON COLUMN obras.uau_obra        IS 'Código da obra no ERP UAU';
COMMENT ON COLUMN obras.uau_obra_fiscal IS 'Código da obra fiscal no ERP UAU';

CREATE INDEX IF NOT EXISTS idx_obras_empresa ON obras(empresa_id);


-- ── Fornecedores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fornecedores (
  id                  SERIAL PRIMARY KEY,
  razao_social        VARCHAR(200) NOT NULL,
  nome_fantasia       VARCHAR(200),
  cnpj                VARCHAR(20)  NOT NULL UNIQUE,
  tel                 VARCHAR(30),
  email               VARCHAR(150),
  email_nf            VARCHAR(150),   -- legado (substituído por emails_copia)
  email_assin         VARCHAR(150),   -- legado (substituído por emails_copia)
  endereco            VARCHAR(500),
  representante       VARCHAR(200),
  cargo_representante VARCHAR(100),
  ativo               BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ  DEFAULT NOW(),
  -- UAU ERP (23/05/2026)
  uau_codigo_fornecedor INTEGER,
  -- E-mails adicionais CC (23/05/2026)
  emails_copia        TEXT[]       NOT NULL DEFAULT '{}'
);

COMMENT ON COLUMN fornecedores.uau_codigo_fornecedor IS
  'Código interno do fornecedor no ERP UAU (CodigoFornecedor na API ManterMedicao)';
COMMENT ON COLUMN fornecedores.emails_copia IS
  'E-mails adicionais do fornecedor (CC). Substitui email_nf e email_assin no frontend.';


-- ── Contratos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER        NOT NULL REFERENCES empresas(id),
  obra_id       INTEGER        NOT NULL REFERENCES obras(id),
  fornecedor_id INTEGER        NOT NULL REFERENCES fornecedores(id),
  numero        VARCHAR(30)    NOT NULL UNIQUE,
  objeto        TEXT           NOT NULL,
  valor_total   NUMERIC(15,2)  NOT NULL DEFAULT 0,
  pct_executado NUMERIC(5,2)   NOT NULL DEFAULT 0,
  inicio        DATE,
  termino       DATE,
  status        VARCHAR(30)    NOT NULL DEFAULT 'Vigente'
                CHECK (status IN ('Vigente','Encerrado','Suspenso')),
  obs           TEXT,
  criado_em     TIMESTAMPTZ    DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ    DEFAULT NOW(),
  -- UAU ERP
  uau_empresa   INTEGER,
  uau_contrato  INTEGER
);

COMMENT ON COLUMN contratos.uau_empresa  IS 'Código da empresa no ERP UAU';
COMMENT ON COLUMN contratos.uau_contrato IS 'Número do contrato no ERP UAU';

CREATE INDEX IF NOT EXISTS idx_contratos_obra ON contratos(obra_id);


-- ── Medições ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicoes (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(30)    NOT NULL UNIQUE,
  empresa_id      INTEGER        NOT NULL REFERENCES empresas(id),
  obra_id         INTEGER        NOT NULL REFERENCES obras(id),
  fornecedor_id   INTEGER        NOT NULL REFERENCES fornecedores(id),
  contrato_id     INTEGER        NOT NULL REFERENCES contratos(id),
  periodo         VARCHAR(7)     NOT NULL,   -- YYYY-MM
  pct_anterior    NUMERIC(5,2)   NOT NULL DEFAULT 0,
  pct_mes         NUMERIC(5,2)   NOT NULL DEFAULT 0,
  pct_total       NUMERIC(5,2)   NOT NULL DEFAULT 0,
  valor_medicao   NUMERIC(15,2)  NOT NULL DEFAULT 0,
  valor_acumulado NUMERIC(15,2)  NOT NULL DEFAULT 0,
  descricao       TEXT,
  status          VARCHAR(30)    NOT NULL DEFAULT 'Rascunho'
                  CHECK (status IN ('Rascunho','Aguardando N1','Aguardando N2','Aguardando N3',
                                    'Aprovado','Em Assinatura','Concluído','Reprovado')),
  tipo            VARCHAR(20)    NOT NULL DEFAULT 'Normal'
                  CHECK (tipo IN ('Normal','Adiantamento','Avanco_Fisico')),
  criado_por      VARCHAR(150),
  criado_em       TIMESTAMPTZ    DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ    DEFAULT NOW(),
  -- UAU ERP
  uau_medicao_id   INTEGER,
  uau_processo_id  INTEGER,
  uau_integrado_em TIMESTAMPTZ
);

COMMENT ON COLUMN medicoes.tipo IS
  'Normal = medição padrão; Adiantamento = pagamento antecipado; Avanco_Fisico = físico sem pagamento';
COMMENT ON COLUMN medicoes.uau_medicao_id  IS 'ID da medição gerada no ERP UAU após integração';
COMMENT ON COLUMN medicoes.uau_processo_id IS 'ID do processo de pagamento no ERP UAU';

CREATE INDEX IF NOT EXISTS idx_medicoes_empresa  ON medicoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_medicoes_obra     ON medicoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_medicoes_status   ON medicoes(status);
CREATE INDEX IF NOT EXISTS idx_medicoes_periodo  ON medicoes(periodo);
CREATE INDEX IF NOT EXISTS idx_medicoes_tipo     ON medicoes(tipo);


-- ── Itens de Contrato ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contrato_itens (
  id             SERIAL PRIMARY KEY,
  contrato_id    INTEGER        NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  ordem          SMALLINT       NOT NULL DEFAULT 0,
  descricao      VARCHAR(500)   NOT NULL,
  unidade        VARCHAR(20)    NOT NULL DEFAULT 'un',
  qtd_total      NUMERIC(15,4)  NOT NULL DEFAULT 0,
  valor_unitario NUMERIC(15,4)  NOT NULL DEFAULT 0,
  valor_total    NUMERIC(15,2)  NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ    DEFAULT NOW(),
  -- UAU ERP
  uau_item                  INTEGER,
  uau_codigo_acompanhamento INTEGER
);

COMMENT ON COLUMN contrato_itens.uau_item                  IS 'Número do item no contrato UAU';
COMMENT ON COLUMN contrato_itens.uau_codigo_acompanhamento IS 'Código do acompanhamento/serviço no UAU';

CREATE INDEX IF NOT EXISTS idx_contrato_itens_contrato ON contrato_itens(contrato_id);


-- ── Itens de Medição ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicao_itens (
  id               SERIAL PRIMARY KEY,
  medicao_id       INTEGER        NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  contrato_item_id INTEGER        REFERENCES contrato_itens(id) ON DELETE SET NULL,
  ordem            SMALLINT       NOT NULL DEFAULT 0,
  descricao        VARCHAR(500)   NOT NULL,
  unidade          VARCHAR(20)    NOT NULL DEFAULT '%',
  qtd_contrato     NUMERIC(15,4)  NOT NULL DEFAULT 0,
  qtd_anterior     NUMERIC(15,4)  NOT NULL DEFAULT 0,
  qtd_mes          NUMERIC(15,4)  NOT NULL DEFAULT 0,
  qtd_acumulada    NUMERIC(15,4)  NOT NULL DEFAULT 0,
  valor_unitario   NUMERIC(15,4)  NOT NULL DEFAULT 0,
  valor_item       NUMERIC(15,2)  NOT NULL DEFAULT 0,
  criado_em        TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicao_itens_medicao       ON medicao_itens(medicao_id);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_contrato_item ON medicao_itens(contrato_item_id);


-- ── Evidências ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidencias (
  id         SERIAL PRIMARY KEY,
  medicao_id INTEGER      NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  nome       VARCHAR(300) NOT NULL,
  tipo       VARCHAR(20),
  tamanho    VARCHAR(20),
  caminho    VARCHAR(500),
  criado_em  TIMESTAMPTZ  DEFAULT NOW()
);


-- ── Aprovações ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aprovacoes (
  id         SERIAL PRIMARY KEY,
  medicao_id INTEGER      NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  nivel      VARCHAR(10)  NOT NULL,
  acao       VARCHAR(20)  NOT NULL,
  usuario    VARCHAR(150) NOT NULL,
  comentario TEXT,
  data_hora  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aprovacoes_medicao ON aprovacoes(medicao_id);


-- ── Alçadas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alcadas (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER      NOT NULL REFERENCES empresas(id),
  obra_id            INTEGER      REFERENCES obras(id),
  nome               VARCHAR(200) NOT NULL,
  n1_titulo          VARCHAR(100),
  n1_grupos          TEXT[],
  n1_prazo           INTEGER      NOT NULL DEFAULT 3,
  n2_titulo          VARCHAR(100),
  n2_grupos          TEXT[],
  n2_prazo           INTEGER      NOT NULL DEFAULT 2,
  n3_titulo          VARCHAR(100),
  n3_grupos          TEXT[],
  n3_prazo           INTEGER      NOT NULL DEFAULT 5,
  escalonamento      BOOLEAN      DEFAULT FALSE,
  escalonamento_dias INTEGER      DEFAULT 2,
  email_copia        VARCHAR(200),
  ativo              BOOLEAN      DEFAULT TRUE,
  criado_em          TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alcadas_empresa ON alcadas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_alcadas_obra    ON alcadas(obra_id);


-- ── Configurações ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracoes (
  chave         VARCHAR(50) PRIMARY KEY,
  valor         JSONB       NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);


-- ── Usuários ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  login         VARCHAR(100) NOT NULL UNIQUE,
  nome          VARCHAR(200),
  email         VARCHAR(200),
  senha_hash    VARCHAR(300),
  grupos_ad     TEXT[],
  perfil        VARCHAR(20)  DEFAULT 'N1'
                CHECK (perfil IN ('N1','N2','N3','ADM','encarregado')),
  ativo         BOOLEAN      DEFAULT TRUE,
  ultimo_acesso TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ  DEFAULT NOW()
);


-- ================================================================
-- CRONOGRAMA
-- ================================================================

-- ── Cronogramas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cronogramas (
  id            SERIAL PRIMARY KEY,
  obra_id       INTEGER      NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome          VARCHAR(255) NOT NULL,
  versao        INTEGER      NOT NULL DEFAULT 1,
  arquivo_nome  VARCHAR(300),
  data_inicio   DATE,
  data_termino  DATE,
  importado_em  TIMESTAMPTZ  DEFAULT NOW(),
  importado_por VARCHAR(150),
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cronogramas_obra ON cronogramas(obra_id);


-- ── Atividades do cronograma (WBS) ───────────────────────────────
CREATE TABLE IF NOT EXISTS atividades_cronograma (
  id              SERIAL PRIMARY KEY,
  cronograma_id   INTEGER        NOT NULL REFERENCES cronogramas(id) ON DELETE CASCADE,
  parent_id       INTEGER        REFERENCES atividades_cronograma(id) ON DELETE SET NULL,
  wbs             VARCHAR(50),
  nome            VARCHAR(500)   NOT NULL,
  data_inicio     DATE,
  data_termino    DATE,
  duracao         INTEGER,
  nivel           INTEGER        NOT NULL DEFAULT 0,
  pct_planejado   NUMERIC(5,2)   NOT NULL DEFAULT 0,
  pct_realizado   NUMERIC(5,2)   NOT NULL DEFAULT 0,
  eh_resumo       BOOLEAN        NOT NULL DEFAULT FALSE,
  ordem           INTEGER        NOT NULL DEFAULT 0,
  uid_externo     INTEGER,
  custo_planejado NUMERIC(15,2),
  -- Suprimentos
  gatilho_dias    INTEGER,
  campos_extras   JSONB
);

CREATE INDEX IF NOT EXISTS idx_atividades_cronograma ON atividades_cronograma(cronograma_id);
CREATE INDEX IF NOT EXISTS idx_atividades_parent     ON atividades_cronograma(parent_id);


-- ── Vínculo Contrato ↔ Atividade ─────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos_atividades (
  id           SERIAL PRIMARY KEY,
  contrato_id  INTEGER NOT NULL REFERENCES contratos(id)             ON DELETE CASCADE,
  atividade_id INTEGER NOT NULL REFERENCES atividades_cronograma(id) ON DELETE CASCADE,
  UNIQUE (contrato_id, atividade_id)
);

CREATE INDEX IF NOT EXISTS idx_contratos_atividades_c ON contratos_atividades(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contratos_atividades_a ON contratos_atividades(atividade_id);


-- ================================================================
-- AUDITORIA
-- ================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL    PRIMARY KEY,
  usuario_id    INTEGER,
  usuario_login VARCHAR(100) NOT NULL DEFAULT '',
  usuario_nome  VARCHAR(200) NOT NULL DEFAULT '',
  acao          VARCHAR(80)  NOT NULL,
  entidade      VARCHAR(60)  NOT NULL,
  entidade_id   INTEGER,
  descricao     TEXT,
  detalhes      JSONB,
  ip            VARCHAR(50),
  criado_em     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_criado_em  ON audit_logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entidade   ON audit_logs(entidade);
CREATE INDEX IF NOT EXISTS idx_audit_usuario_id ON audit_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_acao       ON audit_logs(acao);


-- ================================================================
-- RDC — Requisição de Compra
-- ================================================================

CREATE SEQUENCE IF NOT EXISTS rdc_seq START 1;

CREATE TABLE IF NOT EXISTS rdcs (
  id               SERIAL PRIMARY KEY,
  codigo           VARCHAR(20)    UNIQUE,
  titulo           VARCHAR(500)   NOT NULL,
  obra_id          INTEGER        REFERENCES obras(id) ON DELETE CASCADE,
  atividade_id     INTEGER        REFERENCES atividades_cronograma(id) ON DELETE SET NULL,
  cronograma_id    INTEGER        REFERENCES cronogramas(id) ON DELETE SET NULL,
  grupo_pai        VARCHAR(500),
  wbs              VARCHAR(100),
  status           VARCHAR(50)    NOT NULL DEFAULT 'rascunho',
  criado_por       VARCHAR(200),
  responsavel      VARCHAR(200),
  responsavel_nome VARCHAR(300),
  data_prazo       DATE,
  data_aprovacao   TIMESTAMP,
  data_contratacao TIMESTAMP,
  valor_estimado   NUMERIC(15,2),
  contrato_id      INTEGER        REFERENCES contratos(id) ON DELETE SET NULL,
  observacoes      TEXT,
  created_at       TIMESTAMP      DEFAULT NOW(),
  updated_at       TIMESTAMP      DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdcs_obra      ON rdcs(obra_id);
CREATE INDEX IF NOT EXISTS idx_rdcs_status    ON rdcs(status);
CREATE INDEX IF NOT EXISTS idx_rdcs_atividade ON rdcs(atividade_id);
CREATE INDEX IF NOT EXISTS idx_rdcs_resp      ON rdcs(responsavel);

CREATE TABLE IF NOT EXISTS rdc_itens (
  id             SERIAL PRIMARY KEY,
  rdc_id         INTEGER        NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  descricao      VARCHAR(500)   NOT NULL,
  unidade        VARCHAR(50)    DEFAULT 'UN',
  quantidade     NUMERIC(15,3),
  custo_unitario NUMERIC(15,2),
  custo_total    NUMERIC(15,2),
  especificacao  TEXT,
  ordem          INTEGER        DEFAULT 0,
  created_at     TIMESTAMP      DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_itens_rdc ON rdc_itens(rdc_id);

CREATE TABLE IF NOT EXISTS rdc_historico (
  id              SERIAL PRIMARY KEY,
  rdc_id          INTEGER     NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) DEFAULT 'comentario',
  status_anterior VARCHAR(50),
  status_novo     VARCHAR(50),
  comentario      TEXT,
  usuario         VARCHAR(200),
  created_at      TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_hist_rdc ON rdc_historico(rdc_id);

CREATE TABLE IF NOT EXISTS rdc_anexos (
  id          SERIAL PRIMARY KEY,
  rdc_id      INTEGER        NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  nome        VARCHAR(300)   NOT NULL,
  tipo        VARCHAR(20),
  tamanho     VARCHAR(20),
  caminho     VARCHAR(500),
  provider    VARCHAR(20)    DEFAULT 'local',
  url_storage VARCHAR(1000),
  enviado_por VARCHAR(200),
  created_at  TIMESTAMP      DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_anexos_rdc ON rdc_anexos(rdc_id);


-- ================================================================
-- REQUISIÇÕES DE MATERIAL (Canteiro)
-- ================================================================

CREATE SEQUENCE IF NOT EXISTS seq_req_materiais_codigo START 1;

CREATE TABLE IF NOT EXISTS req_materiais (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(20)    UNIQUE,
  -- Vínculo com cronograma
  atividade_id    INTEGER        REFERENCES atividades_cronograma(id) ON DELETE SET NULL,
  cronograma_id   INTEGER        REFERENCES cronogramas(id)           ON DELETE SET NULL,
  obra_id         INTEGER        REFERENCES obras(id)                 ON DELETE CASCADE,
  -- Conteúdo
  descricao       VARCHAR(500)   NOT NULL,
  quantidade      NUMERIC(12,3),
  unidade         VARCHAR(50),
  observacao      TEXT,
  itens           JSONB          NOT NULL DEFAULT '[]',
  wbs             VARCHAR(100),
  -- Origem: encarregado (canteiro) ou portal_fornecedor
  origem          VARCHAR(30)    NOT NULL DEFAULT 'encarregado',
  fornecedor_id   INTEGER        REFERENCES fornecedores(id) ON DELETE SET NULL,
  contrato_id     INTEGER        REFERENCES contratos(id)    ON DELETE SET NULL,
  -- Status
  status          VARCHAR(50)    NOT NULL DEFAULT 'pendente',
  -- Responsabilidades
  criado_por      VARCHAR(200),
  criado_por_nome VARCHAR(300),
  atendido_por    VARCHAR(200),
  -- Datas
  data_necessidade DATE,
  criado_em       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  -- UAU ERP (21/05/2026)
  uau_pedido_numero VARCHAR(50)
);

COMMENT ON COLUMN req_materiais.uau_pedido_numero IS
  'Número do pedido de compra gerado no ERP UAU após integração';

CREATE INDEX IF NOT EXISTS idx_req_mat_obra_id      ON req_materiais(obra_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_atividade_id ON req_materiais(atividade_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_status       ON req_materiais(status);
CREATE INDEX IF NOT EXISTS idx_req_mat_criado_por   ON req_materiais(criado_por);
CREATE INDEX IF NOT EXISTS idx_req_mat_origem       ON req_materiais(origem);
CREATE INDEX IF NOT EXISTS idx_req_mat_fornecedor   ON req_materiais(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_req_mat_contrato     ON req_materiais(contrato_id);

CREATE TABLE IF NOT EXISTS req_materiais_historico (
  id          SERIAL PRIMARY KEY,
  rm_id       INTEGER     NOT NULL REFERENCES req_materiais(id) ON DELETE CASCADE,
  status_de   VARCHAR(50),
  status_para VARCHAR(50) NOT NULL,
  observacao  TEXT,
  usuario     VARCHAR(200),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_hist_rm_id ON req_materiais_historico(rm_id);

CREATE TABLE IF NOT EXISTS req_materiais_anexos (
  id          SERIAL PRIMARY KEY,
  rm_id       INTEGER       NOT NULL REFERENCES req_materiais(id) ON DELETE CASCADE,
  nome        VARCHAR(500)  NOT NULL,
  tipo        VARCHAR(20)   NOT NULL DEFAULT 'other',
  tamanho     VARCHAR(30),
  caminho     VARCHAR(1000),
  provider    VARCHAR(50)   NOT NULL DEFAULT 'local',
  url_storage TEXT,
  enviado_por VARCHAR(200),
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_anx_rm_id ON req_materiais_anexos(rm_id);


-- ================================================================
-- INSUMOS (Cadastro de materiais)      (19/05/2026)
-- ================================================================

CREATE TABLE IF NOT EXISTS insumos (
  id         SERIAL PRIMARY KEY,
  codigo     TEXT        NOT NULL,
  nome       TEXT        NOT NULL,
  unidade    TEXT        NOT NULL DEFAULT '',
  cap        VARCHAR(50),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por TEXT,
  CONSTRAINT insumos_codigo_unico UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_insumos_codigo ON insumos(codigo);
CREATE INDEX IF NOT EXISTS idx_insumos_nome   ON insumos(LOWER(nome));

COMMENT ON TABLE  insumos IS 'Cadastro de insumos/materiais com código, nome e unidade';
COMMENT ON COLUMN insumos.codigo IS 'Código único do insumo (ex: INS-001)';
COMMENT ON COLUMN insumos.nome   IS 'Descrição/nome do insumo';
COMMENT ON COLUMN insumos.unidade IS 'Unidade de medida (ex: UN, KG, M²)';
COMMENT ON COLUMN insumos.cap    IS 'Conta de Apropriação — integração UAU (GravarPedidoDeCompraDoTipoMaterial)';
COMMENT ON COLUMN insumos.criado_por IS 'Login do usuário que criou o registro';


-- ================================================================
-- UAU: vínculos de planejamento por contrato   (21/05/2026)
-- ================================================================

CREATE TABLE IF NOT EXISTS contrato_uau_vinculos (
  id                       SERIAL PRIMARY KEY,
  contrato_id              INTEGER       NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  servico_pl               VARCHAR(100)  NOT NULL,
  codigo_insumo_pl         VARCHAR(100)  NOT NULL,
  codigo_insumo_servico_pl VARCHAR(100),
  descricao                VARCHAR(255),
  criado_em                TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cont_uau_vinculos_contrato ON contrato_uau_vinculos(contrato_id);

COMMENT ON TABLE contrato_uau_vinculos IS
  'Combinações (servicoPl, codigoInsumoPl) para integração UAU por contrato';
COMMENT ON COLUMN contrato_uau_vinculos.codigo_insumo_servico_pl IS
  'Código do insumo de serviço no Planejamento UAU — usado na integração ManterMedicao';


-- ================================================================
-- VIEWS
-- ================================================================

CREATE OR REPLACE VIEW v_contrato_progresso AS
SELECT
  c.id                              AS contrato_id,
  c.obra_id,
  c.empresa_id,
  c.valor_total,

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

  COALESCE(MAX(
    CASE WHEN COALESCE(m.tipo,'Normal') IN ('Normal','Avanco_Fisico')
              AND m.status IN ('Aprovado','Em Assinatura','Assinado','Concluído','Pago')
         THEN m.pct_total ELSE NULL END
  ), 0)                             AS pct_fisico_acumulado,

  COALESCE(SUM(
    CASE WHEN COALESCE(m.tipo,'Normal') = 'Adiantamento'
              AND m.status NOT IN ('Rascunho','Reprovado')
         THEN m.valor_medicao ELSE 0 END
  ), 0)                             AS total_adiantamentos,

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

  COUNT(DISTINCT m.id)                                                          AS total_medicoes,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'Aprovado')                    AS medicoes_aprovadas,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status NOT IN ('Rascunho','Reprovado')) AS medicoes_ativas

FROM contratos c
LEFT JOIN medicoes m ON m.contrato_id = c.id
GROUP BY c.id, c.obra_id, c.empresa_id, c.valor_total;

COMMENT ON VIEW v_contrato_progresso IS
  'Progresso financeiro, físico e descompasso por contrato — fonte única de verdade.';


-- ================================================================
-- TRIGGERS
-- ================================================================

-- Atualiza atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas','obras','fornecedores','contratos','medicoes','alcadas']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated ON %I;
      CREATE TRIGGER trg_%I_updated
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
    ', t, t, t, t);
  END LOOP;
END$$;

-- updated_at para rdcs
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdcs_updated ON rdcs;
CREATE TRIGGER trg_rdcs_updated
  BEFORE UPDATE ON rdcs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Código automático RDC-YYYY-NNNN
CREATE OR REPLACE FUNCTION gen_rdc_codigo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'RDC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                  LPAD(nextval('rdc_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rdcs_codigo ON rdcs;
CREATE TRIGGER trg_rdcs_codigo
  BEFORE INSERT ON rdcs
  FOR EACH ROW EXECUTE FUNCTION gen_rdc_codigo();

-- Código automático RM-YYYY-NNNN
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


-- ================================================================
-- CONFIGURAÇÕES PADRÃO
-- ================================================================

INSERT INTO configuracoes (chave, valor) VALUES
  ('uau', '{
    "api_url": "",
    "api_key": "",
    "api_versao": "1",
    "empresa_codigo": null,
    "login": "",
    "senha": "",
    "ativo": false
  }'::jsonb)
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes (chave, valor) VALUES
  ('portal_pedido_compra', '{"ativo": false}'::jsonb)
ON CONFLICT (chave) DO NOTHING;


-- ================================================================
SELECT 'Schema completo aplicado com sucesso.' AS resultado;
-- ================================================================
