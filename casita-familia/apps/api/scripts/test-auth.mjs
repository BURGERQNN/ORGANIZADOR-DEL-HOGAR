import { createClient } from "@supabase/supabase-js";

const email = `casita.auth.${Date.now()}@outlook.com`;
const password = "PruebaSegura123!";
const display_name = "Usuario Prueba";

const reg = await fetch("http://localhost:4000/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, display_name }),
});
const regBody = await reg.json();
console.log("REGISTER", reg.status, JSON.stringify(regBody));

const supabase = createClient(
  "https://bvarujfbnhfapzfmffue.supabase.co",
  "sb_publishable_VbcBjpD99vQdxLnpPMBjkg_r9xSgOZB",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const inn = await supabase.auth.signInWithPassword({ email, password });
console.log("SIGNIN_ERR", inn.error?.message || null);
console.log("SIGNIN_OK", Boolean(inn.data.session), inn.data.user?.email);
console.log("TEST_EMAIL", email);

const mod = await (await fetch("http://localhost:5173/src/lib/supabase.ts")).text();
console.log("FRONT_HAS_KEY", mod.includes("sb_publishable_VbcBjpD99vQdxLnpPMBjkg_r9xSgOZB"));
console.log("FRONT_HAS_URL", mod.includes("bvarujfbnhfapzfmffue.supabase.co"));
