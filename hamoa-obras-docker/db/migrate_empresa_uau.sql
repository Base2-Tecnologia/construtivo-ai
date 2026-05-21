-- Adiciona código UAU na tabela de empresas
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS uau_empresa INTEGER;

COMMENT ON COLUMN empresas.uau_empresa IS 'Código da empresa no ERP UAU — usado em pedidos de compra e integrações';
