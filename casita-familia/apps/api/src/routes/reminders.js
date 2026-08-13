import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { REMINDER_STATUSES } from "../lib/catalogs.js";
import { requireAuth, requireHome } from "../middleware/auth.js";
import { isEmailConfigured, reminderEmail, sendEmail } from "../lib/email.js";

const router = Router();

router.get("/", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("reminders")
    .select("*")
    .eq("home_id", req.profile.home_id)
    .order("remind_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reminders: data });
});

router.post("/", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(120),
      remind_at: z.string().datetime({ offset: true }),
      event_id: z.string().uuid().optional().nullable(),
      user_id: z.string().uuid().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("reminders")
    .insert({
      title: parsed.data.title,
      remind_at: parsed.data.remind_at,
      event_id: parsed.data.event_id ?? null,
      user_id: parsed.data.user_id || req.user.id,
      home_id: req.profile.home_id,
    })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ reminder: data });
});

router.patch("/:id", requireAuth, requireHome, async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(REMINDER_STATUSES).optional(),
      remind_at: z.string().datetime({ offset: true }).optional(),
      title: z.string().trim().min(2).max(120).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("reminders")
    .update(parsed.data)
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .select("*")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Recordatorio no encontrado" });
  res.json({ reminder: data });
});

/** Envía el recordatorio por correo al destinatario y marca status=enviado */
router.post("/:id/send", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  if (!isEmailConfigured) {
    return res.status(503).json({ error: "Falta RESEND_API_KEY en el servidor" });
  }

  const { data: reminder, error } = await supabaseAdmin
    .from("reminders")
    .select("*")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!reminder) return res.status(404).json({ error: "Recordatorio no encontrado" });

  const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
    reminder.user_id,
  );
  if (userErr || !authUser?.user?.email) {
    return res.status(400).json({ error: "El destinatario no tiene correo" });
  }

  const { data: home } = await supabaseAdmin
    .from("homes")
    .select("name")
    .eq("id", req.profile.home_id)
    .maybeSingle();

  const tpl = reminderEmail({
    title: reminder.title,
    remindAt: reminder.remind_at,
    homeName: home?.name || "tu hogar",
  });

  try {
    const sent = await sendEmail({ to: authUser.user.email, ...tpl });
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("reminders")
      .update({ status: "enviado" })
      .eq("id", reminder.id)
      .select("*")
      .single();
    if (upErr) return res.status(500).json({ error: upErr.message });
    res.json({ ok: true, id: sent.id, reminder: updated, to: authUser.user.email });
  } catch (err) {
    return res.status(502).json({ error: err.message || "No se pudo enviar" });
  }
});

export default router;
