import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Public community metadata only. No credentials, payment ledger or private files.
export const commonsRecords = pgTable("gitai_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull().default("pending"),
  namespace: text("namespace"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("gitai_namespace_unique").on(t.namespace)]);
export const insertCommonsSchema = createInsertSchema(commonsRecords);
export type CommonsRecordRow = typeof commonsRecords.$inferSelect;
