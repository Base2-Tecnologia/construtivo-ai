-- Armazena o número do pedido de compra gerado no ERP UAU
ALTER TABLE req_materiais ADD COLUMN IF NOT EXISTS uau_pedido_numero VARCHAR(50);
