import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/hogar")({
  head: () => ({
    meta: [
      { title: "Mi hogar — Casita" },
      { name: "description", content: "Tu espacio para organizar las tareas del hogar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HogarPage,
});

function HogarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("No pudimos cerrar la sesión");
      return;
    }
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl md:text-4xl">
          Hola{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <Button variant="outline" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
      <p className="mt-4 text-muted-foreground">
        Tu cuenta está lista. El siguiente paso es crear tu hogar, invitar a los integrantes y
        empezar a repartir las tareas.
      </p>
    </main>
  );
}