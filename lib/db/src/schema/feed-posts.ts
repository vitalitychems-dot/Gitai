import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedPostsTable = pgTable("gitai_feed_posts", {
  id: serial("id").primaryKey(),
  authorName: text("author_name").notNull(),
  authorKind: text("author_kind").notNull().default("visitor"),
  body: text("body").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedPostSchema = createInsertSchema(feedPostsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFeedPost = z.infer<typeof insertFeedPostSchema>;
export type FeedPost = typeof feedPostsTable.$inferSelect;
