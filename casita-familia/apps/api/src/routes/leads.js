import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin, isApiSupabaseConfigured } from "../lib/supabase.js";
import {
  getLeadsNotifyEmail,
  isEmailConfigured,
  leadNotifyEmail,
  sendEmail,
} from "../lib/email.js";

const router = Router();

/**
 * POST /api/leads — público
 * Body: { name, email, phone?, message? }
 * Guarda el lead y notifica por correo.
 */
router.post("/", async (req, res) => {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(120),
      phone: z.string().trim().max(40).optional().nullable(),
      message: z.string().trim().max(1000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (!isApiSupabaseConfigured) {
    return res.status(503).json({ error: "Base de datos no configurada" });
  }

  const payload = {
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone || null,
    message: parsed.data.message || null,
  };

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .insert(payload)
    .select("id, name, email, phone, message, created_at")
    .single();
  if (error) {
    console.error("[leads] insert:", error.message);
    return res.status(500).json({ error: "No se pudo guardar el lead" });
  }

  let emailSent = false;
  let emailError = null;
  if (isEmailConfigured) {
    try {
      const tpl = leadNotifyEmail(payload);
      await sendEmail({ to: getLeadsNotifyEmail(), ...tpl });
      emailSent = true;
      await supabaseAdmin.from("leads").update({ email_sent: true }).eq("id", lead.id);
    } catch (err) {
      emailError = err.message || "No se pudo enviar el correo";
      console.warn("[leads] email:", emailError);
    }
  }

  res.status(201).json({
    ok: true,
    lead,
    email_sent: emailSent,
    email_error: emailError,
    message: emailSent
      ? "Gracias. Recibimos tus datos y te contactaremos pronto."
      : "Gracias. Recibimos tus datos.",
  });
});

export default router;
