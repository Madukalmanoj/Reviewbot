import { pgTable, text, serial, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  prUrl: text("pr_url").notNull().default(""),
  prTitle: text("pr_title"),
  providerUsed: text("provider_used").notNull().default("gemini"),
  findingsJson: jsonb("findings_json").notNull().default([]),
  riskScore: text("risk_score").notNull().default("clean"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({ id: true, timestamp: true });
export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
