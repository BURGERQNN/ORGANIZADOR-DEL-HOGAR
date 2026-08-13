import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { HOME_ROLES } from "../lib/catalogs.js";
import { requireAuth, requireHome, requireRole } from "../middleware/auth.js";
import { isEmailConfigured, sendEmail, welcomeMemberEmail } from "../lib/email.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: req.profile });
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      display_name: z.string().trim().min(2).max(60).optional(),
      avatar_url: z.string().url().nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(parsed.data)
    .eq("id", req.user.id)
    .select("id, display_name, avatar_url, home_id, role, points")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

router.post("/homes", requireAuth, async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (req.profile?.home_id) return res.status(400).json({ error: "Ya perteneces a un hogar" });

  const { data: home, error } = await supabaseAdmin
    .from("homes")
    .insert({ name: parsed.data.name, created_by: req.user.id })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .update({ home_id: home.id, role: "admin" })
    .eq("id", req.user.id)
    .select("id, display_name, avatar_url, home_id, role, points")
    .single();
  if (pErr) return res.status(500).json({ error: pErr.message });

  res.status(201).json({ home, profile });
});

router.post("/homes/join", requireAuth, async (req, res) => {
  const parsed = z.object({ invite_code: z.string().trim().min(4).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (req.profile?.home_id) return res.status(400).json({ error: "Ya perteneces a un hogar" });

  const { data: home, error } = await supabaseAdmin
    .from("homes")
    .select("*")
    .eq("invite_code", parsed.data.invite_code.toLowerCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!home) return res.status(404).json({ error: "Código inválido" });

  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .update({ home_id: home.id, role: "miembro" })
    .eq("id", req.user.id)
    .select("id, display_name, avatar_url, home_id, role, points")
    .single();
  if (pErr) return res.status(500).json({ error: pErr.message });

  res.json({ home, profile });
});

router.get("/homes/current", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("homes")
    .select("id, name, invite_code, created_at")
    .eq("id", req.profile.home_id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Hogar no encontrado" });
  res.json({ home: data });
});

router.get("/homes/members", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url, role, points")
    .eq("home_id", req.profile.home_id)
    .order("points", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ members: data });
});

/** Admin crea un usuario nuevo y lo agrega al hogar */
router.post("/homes/members", requireAuth, requireHome, requireRole("admin"), async (req, res) => {
  const parsed = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      display_name: z.string().trim().min(2).max(60),
      role: z.enum(HOME_ROLES).default("miembro"),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.display_name },
  });
  if (createErr) return res.status(400).json({ error: createErr.message });

  const userId = created.user.id;
  const { data: member, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userId,
      display_name: parsed.data.display_name,
      home_id: req.profile.home_id,
      role: parsed.data.role,
      points: 0,
    })
    .select("id, display_name, avatar_url, role, points")
    .single();
  if (profileErr) return res.status(500).json({ error: profileErr.message });

  let emailSent = false;
  let emailError = null;
  if (isEmailConfigured) {
    try {
      const { data: home } = await supabaseAdmin
        .from("homes")
        .select("name")
        .eq("id", req.profile.home_id)
        .maybeSingle();
      const tpl = welcomeMemberEmail({
        displayName: parsed.data.display_name,
        homeName: home?.name || "tu hogar",
        email: parsed.data.email,
        password: parsed.data.password,
      });
      await sendEmail({ to: parsed.data.email, ...tpl });
      emailSent = true;
    } catch (err) {
      emailError = err.message || "No se pudo enviar el correo de bienvenida";
      console.warn("[emails] welcome member:", emailError);
    }
  }

  res.status(201).json({
    member,
    email: parsed.data.email,
    email_sent: emailSent,
    email_error: emailError,
    message: emailSent
      ? "Usuario creado y correo de bienvenida enviado."
      : "Usuario creado. Puede iniciar sesión con el correo y la contraseña indicados.",
  });
});

router.patch("/homes/members/:id/role", requireAuth, requireHome, requireRole("admin"), async (req, res) => {
  const parsed = z.object({ role: z.enum(HOME_ROLES) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Rol inválido" });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .select("id, display_name, role, points")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Miembro no encontrado" });
  res.json({ member: data });
});

export default router;
