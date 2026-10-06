import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const botAdminUserStatus = pgEnum("bot_admin_user_status", [
  "active",
  "blocked",
]);
export const botAdminProductStatus = pgEnum("bot_admin_product_status", [
  "active",
  "hidden",
]);
export const botAdminOrderStatus = pgEnum("bot_admin_order_status", [
  "new",
  "processing",
  "shipped",
  "completed",
  "cancelled",
]);

const money = (name: string) =>
  numeric(name, { precision: 12, scale: 2, mode: "number" });

export const botAdminUsers = pgTable("bot_admin_users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  name: text("name").notNull(),
  username: text("username"),
  balance: money("balance").notNull().default(0),
  status: botAdminUserStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const botAdminProducts = pgTable("bot_admin_products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Other"),
  price: money("price").notNull().default(0),
  currency: text("currency").notNull().default("KZT"),
  imageUrl: text("image_url"),
  stock: integer("stock").notNull().default(0),
  status: botAdminProductStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const botAdminOrders = pgTable("bot_admin_orders", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id"),
  customerName: text("customer_name").notNull(),
  status: botAdminOrderStatus("status").notNull().default("new"),
  total: money("total").notNull().default(0),
  currency: text("currency").notNull().default("KZT"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const botAdminOrderItems = pgTable("bot_admin_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => botAdminOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => botAdminProducts.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
});

export const botAdminBalanceTransactions = pgTable(
  "bot_admin_balance_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => botAdminUsers.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const botAdminSettings = pgTable("bot_admin_settings", {
  id: integer("id").primaryKey().default(1),
  botName: text("bot_name").notNull().default("My Telegram Bot"),
  welcomeMessage: text("welcome_message")
    .notNull()
    .default("Welcome! Use /catalog to browse products."),
  supportUsername: text("support_username").notNull().default(""),
  currency: text("currency").notNull().default("KZT"),
  adminName: text("admin_name").notNull().default("Administrator"),
  adminContact: text("admin_contact").notNull().default(""),
  botEnabled: boolean("bot_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const botAdminRuntime = pgTable("bot_admin_runtime", {
  id: integer("id").primaryKey().default(1),
  adapter: text("adapter").notNull().default("telegram"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const insertBotAdminUserSchema = createInsertSchema(botAdminUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBotAdminProductSchema = createInsertSchema(
  botAdminProducts,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBotAdminOrderSchema = createInsertSchema(botAdminOrders).omit(
  { id: true, createdAt: true, updatedAt: true },
);

export type BotAdminUserInput = z.infer<typeof insertBotAdminUserSchema>;
export type BotAdminUser = typeof botAdminUsers.$inferSelect;
export type BotAdminProductInput = z.infer<typeof insertBotAdminProductSchema>;
export type BotAdminProduct = typeof botAdminProducts.$inferSelect;
export type BotAdminOrderInput = z.infer<typeof insertBotAdminOrderSchema>;
export type BotAdminOrder = typeof botAdminOrders.$inferSelect;
