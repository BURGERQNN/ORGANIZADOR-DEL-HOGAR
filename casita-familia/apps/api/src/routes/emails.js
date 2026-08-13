import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireHome } from "../middleware/auth.js";
import { inviteHomeEmail, isEmailConfigured, sendEmail } from "../lib/email.js";

const router = Router();

/** Estado de configuración (sin exponer la API key). */
router.get("/status", requireAuth, (_req, res) => {
  res.json({ configured: isEmailConfigured });
});

/**
 * Envío genérico (solo admin del hogar).
 * Body: { to, subject, html?, text? }
 */
router.post("/send", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role !== "admin") {
    return res.status(403).json({ error: "Solo el admin puede enviar correos libres" });
  }
  if (!isEmailConfigured) {
    return res.status(503).json({ error: "Falta RESEND_API_KEY en el servidor" });
  }

  const parsed = z
    .object({
      to: z.string().trim().email(),
      subject: z.string().trim().min(2).max(200),
      html: z.string().trim().min(1).max(50000).optional(),
      text: z.string().trim().min(1).max(20000).optional(),
    })
    .refine((d) => d.html || d.text, { message: "Indica html o text" })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject,
      html: parsed.data.html || `<pre>${parsed.data.text}</pre>`,
      text: parsed.data.text,
    });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    return res.status(502).json({ error: err.message || "No se pudo enviar" });
  }
});

/**
 * Envía el código de invitación del hogar a un correo.
 * Body: { to }
 */
router.post("/invite", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  if (!isEmailConfigured) {
    return res.status(503).json({ error: "Falta RESEND_API_KEY en el servidor" });
  }

  const parsed = z.object({ to: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Correo inválido" });

  const { data: home, error } = await supabaseAdmin
    .from("homes")
    .select("id, name, invite_code")
    .eq("id", req.profile.home_id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!home) return res.status(404).json({ error: "Hogar no encontrado" });

  const tpl = inviteHomeEmail({
    homeName: home.name,
    inviteCode: home.invite_code,
    inviterName: req.profile.display_name || req.user.email || "Un familiar",
  });

  try {
    const result = await sendEmail({ to: parsed.data.to, ...tpl });
    res.json({ ok: true, id: result.id, to: parsed.data.to });
  } catch (err) {
    return res.status(502).json({ error: err.message || "No se pudo enviar" });
  }
});

export default router;
