-- Adiciona CAP (Conta de Apropriação) no cadastro de insumos
ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS cap VARCHAR(50);

COMMENT ON COLUMN insumos.cap IS
  'Código de Conta de Apropriação — usado na integração UAU (GravarPedidoDeCompraDoTipoMaterial)';
