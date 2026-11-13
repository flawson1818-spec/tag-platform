/**
 * Tour d'avant-garde — envoi des e-mails par Gmail (sans SMS, sans nom de domaine).
 *
 * À coller dans https://script.google.com (nouveau projet), avec la phrase secrète à la place de
 * PHRASE_SECRETE, puis Déployer → Nouveau déploiement → Application Web :
 *   Exécuter en tant que : Moi · Qui a accès : Tout le monde.
 * L'adresse de l'application Web va dans EMAIL_RELAY_URL sur Render, la phrase secrète dans
 * EMAIL_RELAY_SECRET. Sans la bonne phrase, le script n'envoie rien.
 */
const SECRET = 'PHRASE_SECRETE';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === 'PHRASE_SECRETE' || data.secret !== SECRET) return answer({ ok: false, error: 'secret' });
    if (!data.to || !data.subject) return answer({ ok: false, error: 'missing' });
    MailApp.sendEmail({
      to: String(data.to),
      subject: String(data.subject).slice(0, 250),
      body: String(data.body || ''),
      name: String(data.fromName || "Tour d'avant-garde"),
    });
    return answer({ ok: true, left: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return answer({ ok: false, error: String(err) });
  }
}

/** Pour tester depuis l'éditeur : envoie un e-mail à toi-même. */
function testerEnvoi() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "Tour d'avant-garde — test", 'Les e-mails partent bien.');
}

function answer(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
