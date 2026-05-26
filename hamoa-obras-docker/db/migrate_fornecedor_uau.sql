-- migrate_fornecedor_uau.sql
-- Adiciona código de fornecedor UAU no cadastro de fornecedores
-- Permite pré-popular o popup de integração ManterMedicao automaticamente

ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS uau_codigo_fornecedor INTEGER;

COMMENT ON COLUMN fornecedores.uau_codigo_fornecedor
  IS 'Código interno do fornecedor no ERP UAU (CodigoFornecedor na API ManterMedicao)';
