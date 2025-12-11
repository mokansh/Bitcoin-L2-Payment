import { 
  type User, type InsertUser,
  type Wallet, type InsertWallet,
  type Transaction, type InsertTransaction,
  type Merchant, type InsertMerchant
} from "@shared/schema";
import {
  type L2Commitment, type InsertL2Commitment
} from "@shared/schema";
import { randomUUID } from "crypto";

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
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  deleteMerchant(id: string): Promise<boolean>;
  
  // L2 Commitments
  getL2Commitment(id: string): Promise<L2Commitment | undefined>;
  getLatestL2CommitmentByWalletId(walletId: string): Promise<L2Commitment | undefined>;
  getL2CommitmentsByWalletId(walletId: string): Promise<L2Commitment[]>;
  createL2Commitment(commitment: InsertL2Commitment): Promise<L2Commitment>;
  updateL2Commitment(id: string, updates: Partial<L2Commitment>): Promise<L2Commitment | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private wallets: Map<string, Wallet>;
  private transactions: Map<string, Transaction>;
  private merchants: Map<string, Merchant>;
  private l2Commitments: Map<string, L2Commitment>;

  constructor() {
    this.users = new Map();
    this.wallets = new Map();
    this.transactions = new Map();
    this.merchants = new Map();
    this.l2Commitments = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Wallets
  async getWallet(id: string): Promise<Wallet | undefined> {
    return this.wallets.get(id);
  }

  async getWalletByBitcoinAddress(address: string): Promise<Wallet | undefined> {
    return Array.from(this.wallets.values()).find(
      (wallet) => wallet.bitcoinAddress === address,
    );
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const id = randomUUID();
    const wallet: Wallet = { 
      id,
      bitcoinAddress: insertWallet.bitcoinAddress,
      taprootAddress: insertWallet.taprootAddress || null,
      bytestreamPublicKey: insertWallet.bytestreamPublicKey || null,
      userPublicKey: insertWallet.userPublicKey || null,
      l2Balance: insertWallet.l2Balance || "0",
    };
    this.wallets.set(id, wallet);
    return wallet;
  }

  async updateWallet(id: string, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const wallet = this.wallets.get(id);
    if (!wallet) return undefined;
    
    const updated = { ...wallet, ...updates };
    this.wallets.set(id, updated);
    return updated;
  }

  // Transactions
  async getTransaction(id: string): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  async getTransactionByTxid(txid: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(
      (tx) => tx.txid === txid,
    );
  }

  async getTransactionsByWalletId(walletId: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (tx) => tx.walletId === walletId,
    );
  }

  async createTransaction(insertTx: InsertTransaction): Promise<Transaction> {
    const id = randomUUID();
    const transaction: Transaction = { 
      id,
      walletId: insertTx.walletId,
      txid: insertTx.txid,
      amount: insertTx.amount,
      status: insertTx.status || "pending",
      confirmations: insertTx.confirmations || 0,
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const tx = this.transactions.get(id);
    if (!tx) return undefined;
    
    const updated = { ...tx, ...updates };
    this.transactions.set(id, updated);
    return updated;
  }

  // Merchants
  async getMerchant(id: string): Promise<Merchant | undefined> {
    return this.merchants.get(id);
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async getMerchantsByWalletId(walletId: string): Promise<Merchant[]> {
    return Array.from(this.merchants.values()).filter(
      (m) => m.walletId === walletId,
    );
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const id = randomUUID();
    const merchant: Merchant = { 
      id,
      name: insertMerchant.name,
      walletId: insertMerchant.walletId,
      paymentUrl: insertMerchant.paymentUrl,
    };
    this.merchants.set(id, merchant);
    return merchant;
  }

  async deleteMerchant(id: string): Promise<boolean> {
    return this.merchants.delete(id);
  }

  // L2 Commitments
  async getL2Commitment(id: string): Promise<L2Commitment | undefined> {
    return this.l2Commitments.get(id);
  }

  async getLatestL2CommitmentByWalletId(walletId: string): Promise<L2Commitment | undefined> {
    const commitments = Array.from(this.l2Commitments.values())
      .filter((c) => c.walletId === walletId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return commitments[0];
  }

  async getL2CommitmentsByWalletId(walletId: string): Promise<L2Commitment[]> {
    return Array.from(this.l2Commitments.values())
      .filter((c) => c.walletId === walletId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createL2Commitment(insertCommitment: InsertL2Commitment): Promise<L2Commitment> {
    const id = randomUUID();
    const commitment: L2Commitment = {
      id,
      walletId: insertCommitment.walletId,
      merchantAddress: insertCommitment.merchantAddress,
      amount: insertCommitment.amount,
      psbt: insertCommitment.psbt,
      userSignedPsbt: insertCommitment.userSignedPsbt,
      settled: insertCommitment.settled,
      settlementTxid: insertCommitment.settlementTxid,
      createdAt: new Date(),
    };
    this.l2Commitments.set(id, commitment);
    return commitment;
  }

  async updateL2Commitment(id: string, updates: Partial<L2Commitment>): Promise<L2Commitment | undefined> {
    const commitment = this.l2Commitments.get(id);
    if (!commitment) return undefined;
    const updated = { ...commitment, ...updates };
    this.l2Commitments.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
