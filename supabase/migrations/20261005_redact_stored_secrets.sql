-- ============================================================================
-- Masquer les codes et jetons déjà enregistrés en clair
-- Jusqu'ici, les copies d'audit des messages (tables emails et whatsapp_messages) gardaient le
-- texte complet : codes de connexion, codes de vérification d'e-mail et de réinitialisation de
-- mot de passe. Ces jetons sont pourtant stockés hachés dans leurs propres tables ; une copie en
-- clair annulait cette protection. Le code de l'API ne les enregistre plus (commit « Stop storing
-- and logging one-time codes and tokens ») ; ce script nettoie les lignes existantes.
--
-- Idempotent : une ligne déjà masquée n'est plus modifiée. Ne touche à aucune autre colonne.
-- ============================================================================

update emails
set body = regexp_replace(body, '(:\s*)\S+(\s*\(valable)', '\1[masqué]\2')
where subject in (
    'Vérifie ton adresse e-mail TAG',
    'Réinitialisation de votre mot de passe TAG',
    'Ton code de vérification TAG',
    'Vérifie ton adresse e-mail Tour d''avant-garde',
    'Réinitialisation de votre mot de passe Tour d''avant-garde',
    'Ton code de vérification Tour d''avant-garde'
  )
  and body !~ '\[masqué\]';

update whatsapp_messages
set body = regexp_replace(body, '(:\s*)\S+(\s*\(valable)', '\1[masqué]\2')
where (body like 'Ton code de vérification TAG%' or body like 'Ton code de vérification Tour d''avant-garde%')
  and body !~ '\[masqué\]';
