import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bountiesTable = pgTable("gitai_bounties", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  rewardLabel: text("reward_label").notNull(),
  status: text("status").notNull().default("open"),
  applicants: integer("applicants").notNull().default(0),
  postedBy: text("posted_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBountySchema = createInsertSchema(bountiesTable).omit({
  id: true,
  status: true,
  applicants: true,
  createdAt: true,
});
export type InsertBounty = z.infer<typeof insertBountySchema>;
export type Bounty = typeof bountiesTable.$inferSelect;
