/**
 * The message every new member finds in their inbox: a Christian welcome, in their language.
 * It comes from the platform's own account (WELCOME_SENDER_ID), created by migration 20261121.
 */
export const WELCOME_SENDER_ID = '00000000-0000-4000-8000-00000000a001';

export const WELCOME_LOCALES = ['fr', 'en', 'es', 'pt'] as const;
export type WelcomeLocale = (typeof WELCOME_LOCALES)[number];

const TEXTS: Record<WelcomeLocale, string> = {
  fr: `Bienvenue {{name}} dans la famille Tour d'avant-garde ! 🙏

Que la grâce et la paix de notre Seigneur Jésus-Christ soient avec toi. Ici, une prière s'élève à chaque instant, et ta place est parmi nous.

« Car là où deux ou trois sont assemblés en mon nom, je suis au milieu d'eux. » (Matthieu 18:20)

Pour bien commencer : entre dans la salle de prière et prie avec les frères et sœurs, dépose une demande de prière pour que d'autres intercèdent pour toi, et partage ce que Dieu fait dans ta vie.

« Que l'Éternel te bénisse, et qu'il te garde ! » (Nombres 6:24)

Avec toute notre affection en Christ,
L'équipe Tour d'avant-garde`,
  en: `Welcome {{name}} to the Tour d'avant-garde family! 🙏

May the grace and peace of our Lord Jesus Christ be with you. Here, a prayer rises at every moment, and you have a place among us.

"For where two or three are gathered together in my name, there am I in the midst of them." (Matthew 18:20)

To begin: enter the prayer room and pray with your brothers and sisters, post a prayer request so others will intercede for you, and share what God is doing in your life.

"The Lord bless you and keep you." (Numbers 6:24)

With all our love in Christ,
The Tour d'avant-garde team`,
  es: `¡Bienvenido/a {{name}} a la familia Tour d'avant-garde! 🙏

Que la gracia y la paz de nuestro Señor Jesucristo estén contigo. Aquí se eleva una oración en cada instante, y tu lugar está entre nosotros.

«Porque donde están dos o tres congregados en mi nombre, allí estoy yo en medio de ellos.» (Mateo 18:20)

Para empezar: entra en la sala de oración y ora con tus hermanos, deja una petición de oración para que otros intercedan por ti, y comparte lo que Dios hace en tu vida.

«El Señor te bendiga y te guarde.» (Números 6:24)

Con todo nuestro cariño en Cristo,
El equipo de Tour d'avant-garde`,
  pt: `Bem-vindo/a {{name}} à família Tour d'avant-garde! 🙏

Que a graça e a paz de nosso Senhor Jesus Cristo estejam contigo. Aqui, uma oração sobe a cada instante, e o teu lugar é entre nós.

«Porque onde estiverem dois ou três reunidos em meu nome, aí estou eu no meio deles.» (Mateus 18:20)

Para começar: entra na sala de oração e ora com os irmãos, deixa um pedido de oração para que outros intercedam por ti, e partilha o que Deus faz na tua vida.

«O Senhor te abençoe e te guarde.» (Números 6:24)

Com todo o nosso carinho em Cristo,
A equipa Tour d'avant-garde`,
};

export function welcomeText(locale: string | null | undefined, name: string): string {
  const key = (locale ?? 'fr').slice(0, 2).toLowerCase() as WelcomeLocale;
  const text = TEXTS[WELCOME_LOCALES.includes(key) ? key : 'fr'];
  return text.replace('{{name}}', name.trim() || 'ami(e)');
}

export const WELCOME_TEXTS = TEXTS;
