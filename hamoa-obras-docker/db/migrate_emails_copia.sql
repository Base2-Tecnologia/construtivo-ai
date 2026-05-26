-- NEG-9: Consolidar 3 campos de e-mail do fornecedor em 1 principal + emails_copia[]
-- email        = e-mail principal (mantido — já existe)
-- emails_copia = lista de e-mails adicionais (CC para notificações / assinatura)
-- email_nf e email_assin são preservados no schema mas não mais editados pelo frontend

ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS emails_copia TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN fornecedores.emails_copia IS
  'E-mails adicionais do fornecedor (CC). Substitui email_nf e email_assin no frontend.';

-- Migra dados existentes: popula emails_copia com email_nf e email_assin (sem duplicar o email principal)
UPDATE fornecedores
SET emails_copia = (
  SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), '{}')
  FROM unnest(ARRAY[email_nf, email_assin]) AS e
  WHERE e IS NOT NULL
    AND e <> ''
    AND (email IS NULL OR e <> email)
)
WHERE email_nf IS NOT NULL OR email_assin IS NOT NULL;
