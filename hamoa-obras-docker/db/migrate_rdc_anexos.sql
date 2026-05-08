-- ============================================================
-- Migração: Anexos da RDC
-- Construtivo AI — Suprimentos
--
-- Execute:
--   Get-Content db\migrate_rdc_anexos.sql | docker compose exec -T construtivo-db psql -U construtivo -d construtivo_obras
-- ============================================================

CREATE TABLE IF NOT EXISTS rdc_anexos (
  id          SERIAL PRIMARY KEY,
  rdc_id      INTEGER NOT NULL REFERENCES rdcs(id) ON DELETE CASCADE,
  nome        VARCHAR(300) NOT NULL,          -- nome original do arquivo
  tipo        VARCHAR(20),                    -- img | pdf | doc | other
  tamanho     VARCHAR(20),                    -- tamanho legível (ex: "2.3 MB")
  caminho     VARCHAR(500),                   -- path no servidor / key no S3 / fileId no GDrive
  provider    VARCHAR(20) DEFAULT 'local',    -- local | s3 | gdrive
  url_storage VARCHAR(1000),                  -- URL permanente (GDrive / S3 público); NULL = gerar signed URL
  enviado_por VARCHAR(200),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rdc_anexos_rdc ON rdc_anexos(rdc_id);

SELECT 'Migration rdc_anexos aplicada com sucesso.' AS resultado;
