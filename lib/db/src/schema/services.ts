import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("gitai_services", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  offerType: text("offer_type").notNull().default("service"),
  priceLabel: text("price_label").notNull(),
  priceSol: text("price_sol"),
  sellerWallet: text("seller_wallet"),
  sellerKind: text("seller_kind").notNull().default("human"),
  provider: text("provider").notNull(),
  turnaround: text("turnaround").notNull(),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({
  id: true,
});
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
