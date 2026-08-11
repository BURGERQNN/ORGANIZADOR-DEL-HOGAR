import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TITLE = "Entrar o crear cuenta — Casita";
const DESC = "Crea tu cuenta y empieza a organizar las tareas del hogar con tu familia.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email({ message: "Correo inválido" }).max(255),
  password: z.string().min(6, { message: "Mínimo 6 caracteres" }).max(72),
});

const signUpSchema = signInSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, { message: "Escribe tu nombre" })
    .max(60, { message: "Máximo 60 caracteres" }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/hogar", replace: true });
    });
  }, [navigate]);

  async function onSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : error.message,
      );
      return;
    }
    navigate({ to: "/hogar", replace: true });
  }

  async function onSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      displayName: form.get("displayName"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/hogar`,
        data: { display_name: parsed.data.displayName },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? "Ese correo ya tiene una cuenta"
          : error.message,
      );
      return;
    }
    if (data.session) {
      navigate({ to: "/hogar", replace: true });
      return;
    }
    setEmailEnviado(true);
    toast.success("Te enviamos un correo para confirmar tu cuenta");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-center font-display text-2xl font-bold text-primary">
          Casita
        </Link>

        {emailEnviado ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <h1 className="text-2xl">Revisa tu correo</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Te enviamos un enlace para confirmar tu cuenta. Al confirmarlo podrás entrar y crear
              tu hogar.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            <Tabs defaultValue="registro">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="registro">Crear cuenta</TabsTrigger>
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
              </TabsList>

              <TabsContent value="registro">
                <form onSubmit={onSignUp} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Tu nombre</Label>
                    <Input id="su-name" name="displayName" maxLength={60} placeholder="Ana" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Correo</Label>
                    <Input id="su-email" name="email" type="email" maxLength={255} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pass">Contraseña</Label>
                    <Input id="su-pass" name="password" type="password" minLength={6} maxLength={72} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Crear mi cuenta
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="entrar">
                <form onSubmit={onSignIn} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Correo</Label>
                    <Input id="si-email" name="email" type="email" maxLength={255} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pass">Contraseña</Label>
                    <Input id="si-pass" name="password" type="password" maxLength={72} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Entrar
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </main>
  );
}