-- ================================================================
-- Script: Apagar todos os Insumos e Requisições de Material
--
-- ⚠️  ATENÇÃO: operação irreversível — faça backup antes!
--
-- Como executar:
--   cat db/truncate_insumos_e_requisicoes.sql | \
--     docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ================================================================

BEGIN;

-- 1. Requisições de Material — filhas primeiro (FK)
TRUNCATE TABLE req_materiais_anexos   RESTART IDENTITY CASCADE;
TRUNCATE TABLE req_materiais_historico RESTART IDENTITY CASCADE;
TRUNCATE TABLE req_materiais           RESTART IDENTITY CASCADE;

-- 2. Insumos
TRUNCATE TABLE insumos                 RESTART IDENTITY CASCADE;

-- Zera também a sequência de código RM-YYYY-NNNN
ALTER SEQUENCE seq_req_materiais_codigo RESTART WITH 1;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM insumos)       AS insumos_restantes,
  (SELECT COUNT(*) FROM req_materiais) AS requisicoes_restantes;
