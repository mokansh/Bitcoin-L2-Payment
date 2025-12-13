import {
  type User, type InsertUser,
  type Wallet, type InsertWallet,
  type Transaction, type InsertTransaction,
  type Merchant, type InsertMerchant,
  users, wallets, transactions, merchants, l2Commitments
} from "@shared/schema";
import {
  type L2Commitment, type InsertL2Commitment
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Wallets
  getWallet(id: string): Promise<Wallet | undefined>;
  getWalletByBitcoinAddress(address: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWallet(id: string, updates: Partial<Wallet>): Promise<Wallet | undefined>;

  // Transactions
  getTransaction(id: string): Promise<Transaction | undefined>;
  getTransactionByTxid(txid: string): Promise<Transaction | undefined>;
  getTransactionsByWalletId(walletId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;

  // Merchants
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  getMerchantsByWalletId(walletId: string): Promise<Merchant[]>;
  getAllMerchants(): Promise<Merchant[]>;
  createMerchant(insertMerchant: InsertMerchant): Promise<Merchant>;
  deleteMerchant(id: string): Promise<boolean>;

  // L2 Commitments
  getL2Commitment(id: string): Promise<L2Commitment | undefined>;
  getLatestL2CommitmentByWalletId(walletId: string): Promise<L2Commitment | undefined>;
  getL2CommitmentsByWalletId(walletId: string): Promise<L2Commitment[]>;
  getAllL2Commitments(): Promise<L2Commitment[]>;
  createL2Commitment(commitment: InsertL2Commitment): Promise<L2Commitment>;
  updateL2Commitment(id: string, updates: Partial<L2Commitment>): Promise<L2Commitment | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Wallets
  async getWallet(id: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    return wallet;
  }

  async getWalletByBitcoinAddress(address: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.bitcoinAddress, address));
    return wallet;
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const [wallet] = await db.insert(wallets).values(insertWallet).returning();
    return wallet;
  }

  async updateWallet(id: string, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const [wallet] = await db
      .update(wallets)
      .set(updates)
      .where(eq(wallets.id, id))
      .returning();
    return wallet;
  }

  // Transactions
  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
    return tx;
  }

  async getTransactionByTxid(txid: string): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.txid, txid));
    return tx;
  }

  async getTransactionsByWalletId(walletId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.walletId, walletId)).orderBy(desc(transactions.createdAt));
  }

  async createTransaction(insertTx: InsertTransaction): Promise<Transaction> {
    const [tx] = await db.insert(transactions).values(insertTx).returning();
    return tx;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [tx] = await db
      .update(transactions)
      .set(updates)
      .where(eq(transactions.id, id))
      .returning();
    return tx;
  }

  // Merchants
  async getMerchant(id: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant;
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.name, name));
    return merchant;
  }

  async getMerchantsByWalletId(walletId: string): Promise<Merchant[]> {
    return await db.select().from(merchants).where(eq(merchants.walletId, walletId));
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return await db.select().from(merchants);
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const [merchant] = await db.insert(merchants).values(insertMerchant).returning();
    return merchant;
  }

  async deleteMerchant(id: string): Promise<boolean> {
    const [deleted] = await db.delete(merchants).where(eq(merchants.id, id)).returning();
    return !!deleted;
  }

  // L2 Commitments
  async getL2Commitment(id: string): Promise<L2Commitment | undefined> {
    const [commitment] = await db.select().from(l2Commitments).where(eq(l2Commitments.id, id));
    return commitment;
  }

  async getLatestL2CommitmentByWalletId(walletId: string): Promise<L2Commitment | undefined> {
    const [commitment] = await db
      .select()
      .from(l2Commitments)
      .where(eq(l2Commitments.walletId, walletId))
      .orderBy(desc(l2Commitments.createdAt))
      .limit(1);
    return commitment;
  }

  async getL2CommitmentsByWalletId(walletId: string): Promise<L2Commitment[]> {
    return await db
      .select()
      .from(l2Commitments)
      .where(eq(l2Commitments.walletId, walletId))
      .orderBy(desc(l2Commitments.createdAt));
  }

  async getAllL2Commitments(): Promise<L2Commitment[]> {
    return await db.select().from(l2Commitments);
  }

  async createL2Commitment(insertCommitment: InsertL2Commitment): Promise<L2Commitment> {
    const [commitment] = await db.insert(l2Commitments).values(insertCommitment).returning();
    return commitment;
  }

  async updateL2Commitment(id: string, updates: Partial<L2Commitment>): Promise<L2Commitment | undefined> {
    const [commitment] = await db
      .update(l2Commitments)
      .set(updates)
      .where(eq(l2Commitments.id, id))
      .returning();
    return commitment;
  }
}

export const storage = new DatabaseStorage();
