import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bitcoinAddress: text("bitcoin_address").notNull(),
  taprootAddress: text("taproot_address"),
  bytestreamPublicKey: text("bytestream_public_key"),
  userPublicKey: text("user_public_key"),
  l2Balance: numeric("l2_balance").default("0"),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull(),
  txid: text("txid").notNull(),
  amount: numeric("amount").notNull(),
  status: text("status").notNull().default("pending"),
  confirmations: integer("confirmations").default(0),
});

export const merchants = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  walletId: varchar("wallet_id").notNull(),
  paymentUrl: text("payment_url").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertWalletSchema = createInsertSchema(wallets).pick({
  bitcoinAddress: true,
  taprootAddress: true,
  bytestreamPublicKey: true,
  userPublicKey: true,
  l2Balance: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  walletId: true,
  txid: true,
  amount: true,
  status: true,
  confirmations: true,
});

export const insertMerchantSchema = createInsertSchema(merchants).pick({
  name: true,
  walletId: true,
  paymentUrl: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;
