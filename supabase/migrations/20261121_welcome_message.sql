-- ============================================================================
-- Message de bienvenue chrétien dans la messagerie de chaque membre.
--   1. crée le compte de la plateforme « Tour d'avant-garde » (expéditeur, sans connexion possible) ;
--   2. dépose, dans la messagerie de CHAQUE membre actif inscrit, un message de bienvenue dans sa langue
--      (fr, en, es, pt ; français par défaut). Les nouveaux inscrits le reçoivent ensuite automatiquement.
-- Additif et idempotent : relancer ce fichier n'envoie jamais deux fois le message au même membre.
-- Pré-requis : migration 20261108 (messagerie privée).
-- ============================================================================

insert into users (id, email, password_hash, display_name, locale, status)
values ('00000000-0000-4000-8000-00000000a001', 'bienvenue@tag.invalid', '!compte-de-la-plateforme-sans-connexion', 'Tour d''avant-garde', 'fr', 'ACTIVE')
on conflict (id) do nothing;

create or replace function pg_temp.welcome_text(loc text, who text) returns text language sql as $f$
  select replace(case left(coalesce(loc, 'fr'), 2)
    when 'en' then 'Welcome {{name}} to the Tour d''avant-garde family! 🙏

May the grace and peace of our Lord Jesus Christ be with you. Here, a prayer rises at every moment, and you have a place among us.

"For where two or three are gathered together in my name, there am I in the midst of them." (Matthew 18:20)

To begin: enter the prayer room and pray with your brothers and sisters, post a prayer request so others will intercede for you, and share what God is doing in your life.

"The Lord bless you and keep you." (Numbers 6:24)

With all our love in Christ,
The Tour d''avant-garde team'
    when 'es' then '¡Bienvenido/a {{name}} a la familia Tour d''avant-garde! 🙏

Que la gracia y la paz de nuestro Señor Jesucristo estén contigo. Aquí se eleva una oración en cada instante, y tu lugar está entre nosotros.

«Porque donde están dos o tres congregados en mi nombre, allí estoy yo en medio de ellos.» (Mateo 18:20)

Para empezar: entra en la sala de oración y ora con tus hermanos, deja una petición de oración para que otros intercedan por ti, y comparte lo que Dios hace en tu vida.

«El Señor te bendiga y te guarde.» (Números 6:24)

Con todo nuestro cariño en Cristo,
El equipo de Tour d''avant-garde'
    when 'pt' then 'Bem-vindo/a {{name}} à família Tour d''avant-garde! 🙏

Que a graça e a paz de nosso Senhor Jesus Cristo estejam contigo. Aqui, uma oração sobe a cada instante, e o teu lugar é entre nós.

«Porque onde estiverem dois ou três reunidos em meu nome, aí estou eu no meio deles.» (Mateus 18:20)

Para começar: entra na sala de oração e ora com os irmãos, deixa um pedido de oração para que outros intercedam por ti, e partilha o que Deus faz na tua vida.

«O Senhor te abençoe e te guarde.» (Números 6:24)

Com todo o nosso carinho em Cristo,
A equipa Tour d''avant-garde'
    else 'Bienvenue {{name}} dans la famille Tour d''avant-garde ! 🙏

Que la grâce et la paix de notre Seigneur Jésus-Christ soient avec toi. Ici, une prière s''élève à chaque instant, et ta place est parmi nous.

« Car là où deux ou trois sont assemblés en mon nom, je suis au milieu d''eux. » (Matthieu 18:20)

Pour bien commencer : entre dans la salle de prière et prie avec les frères et sœurs, dépose une demande de prière pour que d''autres intercèdent pour toi, et partage ce que Dieu fait dans ta vie.

« Que l''Éternel te bénisse, et qu''il te garde ! » (Nombres 6:24)

Avec toute notre affection en Christ,
L''équipe Tour d''avant-garde'
  end, '{{name}}', coalesce(nullif(trim(who), ''), 'ami(e)'))
$f$;

-- Une conversation par membre (paire ordonnée : user_a < user_b), déjà lue côté plateforme.
insert into conversations (user_a, user_b, last_message_at, user_a_read_at, user_b_read_at)
select least(u.id, '00000000-0000-4000-8000-00000000a001'::uuid), greatest(u.id, '00000000-0000-4000-8000-00000000a001'::uuid), now(),
       case when '00000000-0000-4000-8000-00000000a001'::uuid < u.id then now() end,
       case when '00000000-0000-4000-8000-00000000a001'::uuid > u.id then now() end
from users u
where u.status = 'ACTIVE' and u.deleted_at is null
  and u.id <> '00000000-0000-4000-8000-00000000a001'::uuid
  and u.email not like 'deleted-%@tag.invalid'
on conflict (user_a, user_b) do nothing;

-- Le message, une seule fois par conversation.
insert into direct_messages (conversation_id, sender_id, content)
select c.id, '00000000-0000-4000-8000-00000000a001'::uuid, pg_temp.welcome_text(u.locale, u.display_name)
from conversations c
join users u on u.id = case when c.user_a = '00000000-0000-4000-8000-00000000a001'::uuid then c.user_b else c.user_a end
where (c.user_a = '00000000-0000-4000-8000-00000000a001'::uuid or c.user_b = '00000000-0000-4000-8000-00000000a001'::uuid)
  and not exists (select 1 from direct_messages d where d.conversation_id = c.id);
