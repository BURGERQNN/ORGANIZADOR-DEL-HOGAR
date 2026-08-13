import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY?.trim();
const fromEmail =
  process.env.RESEND_FROM_EMAIL?.trim() || "Casita Familia <onboarding@resend.dev>";

export const isEmailConfigured = Boolean(apiKey);

const resend = isEmailConfigured ? new Resend(apiKey) : null;

/**
 * Envía un correo con Resend.
 * @param {{ to: string | string[], subject: string, html: string, text?: string }} opts
 * @returns {Promise<{ id: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    const err = new Error("Correo no configurado: falta RESEND_API_KEY en apps/api/.env");
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || undefined,
  });

  if (error) {
    const err = new Error(error.message || "No se pudo enviar el correo");
    err.code = "EMAIL_SEND_FAILED";
    throw err;
  }

  return { id: data?.id || "" };
}

export function welcomeMemberEmail({ displayName, homeName, email, password }) {
  const subject = `Bienvenido a ${homeName} — Casita Familia`;
  const text = `Hola ${displayName},\n\nTe agregaron al hogar "${homeName}".\nCorreo: ${email}\nContraseña temporal: ${password}\n\nInicia sesión y cámbiala cuando puedas.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
      <h1 style="font-size:20px">Hola, ${escapeHtml(displayName)}</h1>
      <p>Te agregaron al hogar <strong>${escapeHtml(homeName)}</strong> en Casita Familia.</p>
      <p><strong>Correo:</strong> ${escapeHtml(email)}<br/>
      <strong>Contraseña temporal:</strong> ${escapeHtml(password)}</p>
      <p>Inicia sesión y cámbiala cuando puedas.</p>
    </div>
  `;
  return { subject, html, text };
}

export function inviteHomeEmail({ homeName, inviteCode, inviterName }) {
  const subject = `Invitación a ${homeName} — Casita Familia`;
  const text = `${inviterName} te invita al hogar "${homeName}". Código: ${inviteCode}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
      <h1 style="font-size:20px">Invitación al hogar</h1>
      <p><strong>${escapeHtml(inviterName)}</strong> te invita a unirte a
        <strong>${escapeHtml(homeName)}</strong>.</p>
      <p>Usa este código al registrarte o al unirte:</p>
      <p style="font-size:24px;letter-spacing:2px"><strong>${escapeHtml(inviteCode)}</strong></p>
    </div>
  `;
  return { subject, html, text };
}

export function reminderEmail({ title, remindAt, homeName }) {
  const when = new Date(remindAt).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = `Recordatorio: ${title}`;
  const text = `Recordatorio de ${homeName}: ${title}\nFecha: ${when}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
      <h1 style="font-size:20px">Recordatorio</h1>
      <p>Del hogar <strong>${escapeHtml(homeName)}</strong>:</p>
      <p style="font-size:18px"><strong>${escapeHtml(title)}</strong></p>
      <p>Programado para: ${escapeHtml(when)}</p>
    </div>
  `;
  return { subject, html, text };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
