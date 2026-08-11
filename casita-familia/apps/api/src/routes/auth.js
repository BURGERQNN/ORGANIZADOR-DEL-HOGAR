import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin, isApiSupabaseConfigured } from "../lib/supabase.js";

const router = Router();

/**
 * Registro vía service role con email confirmado.
 * Evita el bloqueo de "Confirm email" + rate limit de correo en desarrollo.
 * El login posterior sigue siendo supabase.auth.signInWithPassword en el front.
 */
router.post("/register", async (req, res) => {
  if (!isApiSupabaseConfigured) {
    return res.status(503).json({
      error: "API sin SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Revisa apps/api/.env",
    });
  }

  const parsed = z
    .object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      display_name: z.string().trim().min(2).max(60),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }

  const { email, password, display_name } = parsed.data;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return res.status(409).json({ error: "Ese correo ya tiene una cuenta. Usa Entrar." });
    }
    return res.status(400).json({ error: error.message });
  }

  // Asegura fila de perfil (por si el trigger aún no existe en la DB)
  if (data.user?.id) {
    await supabaseAdmin.from("profiles").upsert({
      id: data.user.id,
      display_name,
      points: 0,
      role: "miembro",
    });
  }

  return res.status(201).json({
    user: { id: data.user.id, email: data.user.email },
    message: "Cuenta creada. Ya puedes iniciar sesión.",
  });
});

export default router;
