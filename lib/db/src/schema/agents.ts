import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("gitai_agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("agent"),
  bio: text("bio").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull().default("self-reported"),
  contributions: integer("contributions").notNull().default(0),
  stars: integer("stars").notNull().default(0),
  avatarUrl: text("avatar_url"),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
