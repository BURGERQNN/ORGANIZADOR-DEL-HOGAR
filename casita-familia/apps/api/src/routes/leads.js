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
 * Usa la tabla leads existente (nombre/telefono/servicios/respuestas/propuesta).
 */
router.post("/", async (req, res) => {
  try {
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

    const name = parsed.data.name;
    const email = parsed.data.email.toLowerCase();
    const phone = parsed.data.phone || "";
    const message = parsed.data.message || "";

    const row = {
      nombre: name,
      email,
      telefono: phone,
      servicios: ["casita"],
      respuestas: message ? { mensaje: message, fuente: "web_auth" } : { fuente: "web_auth" },
      propuesta: message || "Interés desde el formulario web de Casita",
      estado: "pendiente_revision",
    };

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert(row)
      .select("id, nombre, email, telefono, estado, created_at")
      .single();
    if (error) {
      console.error("[leads] insert:", error.message);
      return res.status(500).json({ error: "No se pudo guardar el lead", detail: error.message });
    }

    let emailSent = false;
    let emailError = null;
    if (isEmailConfigured) {
      try {
        const tpl = leadNotifyEmail({ name, email, phone: phone || null, message: message || null });
        await sendEmail({ to: getLeadsNotifyEmail(), ...tpl });
        emailSent = true;
        await supabaseAdmin
          .from("leads")
          .update({ enviado_at: new Date().toISOString() })
          .eq("id", lead.id);
      } catch (err) {
        emailError = err.message || "No se pudo enviar el correo";
        console.warn("[leads] email:", emailError);
      }
    }

    res.status(201).json({
      ok: true,
      lead: {
        id: lead.id,
        name: lead.nombre,
        email: lead.email,
        phone: lead.telefono,
        status: lead.estado,
        created_at: lead.created_at,
      },
      email_sent: emailSent,
      email_error: emailError,
      message: emailSent
        ? "Gracias. Recibimos tus datos y te contactaremos pronto."
        : "Gracias. Recibimos tus datos.",
    });
  } catch (err) {
    console.error("[leads] unexpected:", err);
    return res.status(500).json({ error: err.message || "Error interno" });
  }
});

export default router;
