-- ================================================================
-- Script: truncate_medicoes.sql
-- Apaga TODAS as medições e dados dependentes (para reset de testes).
--
-- Como executar:
--   cat db/truncate_medicoes.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ================================================================

BEGIN;

-- Zera referência a medições em tabelas que não têm ON DELETE CASCADE
UPDATE lbm_progresso
SET medicao_id = NULL,
    status = 'nao_iniciado',
    data_inicio_real = NULL,
    data_fim_real = NULL
WHERE medicao_id IS NOT NULL;

DELETE FROM audit_logs WHERE entidade = 'medicao';

-- TRUNCATE em cascata: apaga medicoes + todas as tabelas dependentes
-- (medicao_itens, evidencias, aprovacoes, portal_nfs, portal_tokens, whatsapp_tokens)
TRUNCATE TABLE medicoes RESTART IDENTITY CASCADE;

COMMIT;

SELECT 'Medições apagadas com sucesso.' AS resultado;
