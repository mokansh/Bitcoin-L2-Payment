import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWalletSchema, insertTransactionSchema, insertMerchantSchema } from "@shared/schema";
import { z } from "zod";

// Placeholder Bitcoin functions
function generateTaprootAddress(bytestreamPublicKey: string, userPublicKey: string): string {
  const combined = bytestreamPublicKey + userPublicKey;
  const hash = Array.from(combined).reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  
  const chars = "0123456789abcdefghjkmnpqrstuvwxyz";
  let address = "bc1p";
  for (let i = 0; i < 58; i++) {
    address += chars[Math.abs((hash * (i + 1)) % 32)];
  }
  return address;
}

function getBitcoinTxStatus(txid: string): { confirmed: boolean; confirmations: number; blockHeight?: number } {
  // Simulate random confirmation status
  const confirmations = Math.floor(Math.random() * 3);
  return {
    confirmed: confirmations >= 1,
    confirmations,
    blockHeight: confirmations > 0 ? 800000 + Math.floor(Math.random() * 1000) : undefined,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === Wallet Routes ===
  
  // Create wallet
  app.post("/api/wallets", async (req, res) => {
    try {
      const data = insertWalletSchema.parse(req.body);
      
      // Check if wallet already exists for this bitcoin address
      const existing = await storage.getWalletByBitcoinAddress(data.bitcoinAddress);
      if (existing) {
        return res.json(existing);
      }
      
      const wallet = await storage.createWallet(data);
      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wallet data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  // Get wallet by ID
  app.get("/api/wallets/:id", async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.params.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      res.json(wallet);
    } catch {
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });

  // Get wallet by bitcoin address
  app.get("/api/wallets/address/:address", async (req, res) => {
    try {
      const wallet = await storage.getWalletByBitcoinAddress(req.params.address);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      res.json(wallet);
    } catch {
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });

  // Generate Taproot address for wallet
  app.post("/api/wallets/:id/generate-taproot", async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.params.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      const { userPublicKey } = req.body;
      if (!userPublicKey) {
        return res.status(400).json({ error: "User public key is required" });
      }

      // Generate bytestream public key (in production, this would be derived properly)
      const bytestreamPublicKey = Array.from({ length: 64 }, () => 
        "0123456789abcdef"[Math.floor(Math.random() * 16)]
      ).join("");

      const taprootAddress = generateTaprootAddress(bytestreamPublicKey, userPublicKey);

      const updated = await storage.updateWallet(wallet.id, {
        taprootAddress,
        bytestreamPublicKey,
        userPublicKey,
      });

      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to generate Taproot address" });
    }
  });

  // Update wallet L2 balance
  app.patch("/api/wallets/:id/balance", async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.params.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      const { l2Balance } = req.body;
      if (l2Balance === undefined) {
        return res.status(400).json({ error: "L2 balance is required" });
      }

      const updated = await storage.updateWallet(wallet.id, { l2Balance });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update balance" });
    }
  });

  // === Transaction Routes ===

  // Create transaction
  app.post("/api/transactions", async (req, res) => {
    try {
      const data = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction(data);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid transaction data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // Get transaction by ID
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const tx = await storage.getTransaction(req.params.id);
      if (!tx) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      res.json(tx);
    } catch {
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  });

  // Get transaction status (checks Bitcoin network)
  app.get("/api/transactions/:id/status", async (req, res) => {
    try {
      const tx = await storage.getTransaction(req.params.id);
      if (!tx) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Get status from "Bitcoin network" (placeholder)
      const status = getBitcoinTxStatus(tx.txid);

      // Update transaction if confirmed
      if (status.confirmed && tx.status !== "confirmed") {
        await storage.updateTransaction(tx.id, {
          status: "confirmed",
          confirmations: status.confirmations,
        });

        // Update wallet L2 balance
        const wallet = await storage.getWallet(tx.walletId);
        if (wallet) {
          const newBalance = (parseFloat(wallet.l2Balance || "0") + parseFloat(tx.amount)).toString();
          await storage.updateWallet(wallet.id, { l2Balance: newBalance });
        }
      }

      res.json({
        ...tx,
        status: status.confirmed ? "confirmed" : "pending",
        confirmations: status.confirmations,
        blockHeight: status.blockHeight,
      });
    } catch {
      res.status(500).json({ error: "Failed to check transaction status" });
    }
  });

  // Get transactions by wallet ID
  app.get("/api/wallets/:walletId/transactions", async (req, res) => {
    try {
      const transactions = await storage.getTransactionsByWalletId(req.params.walletId);
      res.json(transactions);
    } catch {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // === Merchant Routes ===

  // Create merchant
  app.post("/api/merchants", async (req, res) => {
    try {
      const data = insertMerchantSchema.parse(req.body);
      
      // Check if merchant name already exists
      const existing = await storage.getMerchantByName(data.name);
      if (existing) {
        return res.status(409).json({ error: "Merchant name already taken" });
      }

      const merchant = await storage.createMerchant(data);
      res.status(201).json(merchant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid merchant data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });

  // Get merchant by name (must come before :id route)
  app.get("/api/merchants/name/:name", async (req, res) => {
    try {
      const merchant = await storage.getMerchantByName(req.params.name);
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      // Also get wallet info for L2 balance
      const wallet = await storage.getWallet(merchant.walletId);

      res.json({
        ...merchant,
        l2Balance: wallet?.l2Balance || "0",
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch merchant" });
    }
  });

  // Get merchant by ID
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      res.json(merchant);
    } catch {
      res.status(500).json({ error: "Failed to fetch merchant" });
    }
  });

  // Get merchants by wallet ID
  app.get("/api/wallets/:walletId/merchants", async (req, res) => {
    try {
      const merchants = await storage.getMerchantsByWalletId(req.params.walletId);
      res.json(merchants);
    } catch {
      res.status(500).json({ error: "Failed to fetch merchants" });
    }
  });

  // Process merchant payment
  app.post("/api/merchants/:name/pay", async (req, res) => {
    try {
      const merchant = await storage.getMerchantByName(req.params.name);
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      const wallet = await storage.getWallet(merchant.walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      const currentBalance = parseFloat(wallet.l2Balance || "0");
      const paymentAmount = parseFloat(amount);

      if (paymentAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient L2 balance" });
      }

      const newBalance = (currentBalance - paymentAmount).toFixed(8);
      const updated = await storage.updateWallet(wallet.id, { l2Balance: newBalance });

      res.json({
        success: true,
        newBalance: updated?.l2Balance,
        paymentAmount: amount,
      });
    } catch {
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // Delete merchant
  app.delete("/api/merchants/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMerchant(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete merchant" });
    }
  });

  return httpServer;
}
