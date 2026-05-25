import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSettingsResponse, UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

const SETTING_KEYS = [
  "activeProvider",
  "webhookSecret",
  "githubToken",
  "geminiApiKey",
  "groqApiKey",
  "ollamaHost",
  "ollamaModel",
];

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {
    activeProvider: "gemini",
    webhookSecret: "",
    githubToken: "",
    geminiApiKey: "",
    groqApiKey: "",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "qwen2.5:14b",
  };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getAllSettings();

  const vercelUrl = process.env.VERCEL_URL ?? process.env.APP_URL ?? "";
  const webhookUrl = vercelUrl
    ? `https://${vercelUrl}/api/webhook`
    : null;

  res.json(
    GetSettingsResponse.parse({
      activeProvider: (settings.activeProvider ?? "gemini") as "gemini" | "groq" | "ollama",
      webhookSecret: settings.webhookSecret ?? "",
      githubToken: settings.githubToken ? "***configured***" : "",
      geminiApiKey: settings.geminiApiKey ? "***configured***" : "",
      groqApiKey: settings.groqApiKey ? "***configured***" : "",
      ollamaHost: settings.ollamaHost ?? "http://localhost:11434",
      ollamaModel: settings.ollamaModel ?? "qwen2.5:14b",
      webhookUrl,
    })
  );
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = parsed.data;

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || !SETTING_KEYS.includes(key)) continue;
    const existing = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key));

    if (existing.length > 0) {
      await db
        .update(settingsTable)
        .set({ value: String(value) })
        .where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value: String(value) });
    }
  }

  const settings = await getAllSettings();
  const vercelUrl = process.env.VERCEL_URL ?? process.env.APP_URL ?? "";
  const webhookUrl = vercelUrl
    ? `https://${vercelUrl}/api/webhook`
    : null;

  res.json(
    GetSettingsResponse.parse({
      activeProvider: (settings.activeProvider ?? "gemini") as "gemini" | "groq" | "ollama",
      webhookSecret: settings.webhookSecret ?? "",
      githubToken: settings.githubToken ? "***configured***" : "",
      geminiApiKey: settings.geminiApiKey ? "***configured***" : "",
      groqApiKey: settings.groqApiKey ? "***configured***" : "",
      ollamaHost: settings.ollamaHost ?? "http://localhost:11434",
      ollamaModel: settings.ollamaModel ?? "qwen2.5:14b",
      webhookUrl,
    })
  );
});

export default router;
