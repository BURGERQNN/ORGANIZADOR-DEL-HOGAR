import "dotenv/config";
import express from "express";
import cors from "cors";
import profilesRouter from "./routes/profiles.js";
import eventsRouter from "./routes/events.js";
import remindersRouter from "./routes/reminders.js";
import rewardsRouter from "./routes/rewards.js";
import authRouter from "./routes/auth.js";
import financeRouter from "./routes/finance.js";
import emailsRouter from "./routes/emails.js";
import leadsRouter from "./routes/leads.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174")
      .split(",")
      .map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "casita-api" }));

app.use("/api/auth", authRouter);
app.use("/api/finance", financeRouter);
app.use("/api", profilesRouter);
app.use("/api/events", eventsRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/leads", leadsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

app.listen(port, () => {
  console.log(`[casita-api] http://localhost:${port}`);
});
