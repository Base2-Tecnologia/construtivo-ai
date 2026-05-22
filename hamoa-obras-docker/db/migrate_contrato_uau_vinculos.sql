-- Vínculos UAU ao Planejamento (SI) por contrato
-- Cada contrato pode ter N combinações de (servico_pl + codigo_insumo_pl)
-- usadas para geração de pedido de compra no UAU

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

-- Adição do campo Cód. Insumo Serviço PL (para integração ManterMedicao)
ALTER TABLE contrato_uau_vinculos
  ADD COLUMN IF NOT EXISTS codigo_insumo_servico_pl VARCHAR(100);

COMMENT ON COLUMN contrato_uau_vinculos.codigo_insumo_servico_pl IS
  'Código do insumo de serviço no Planejamento UAU — usado na integração ManterMedicao';
