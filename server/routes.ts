import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWalletSchema, insertTransactionSchema, insertMerchantSchema } from "@shared/schema";
import { z } from "zod";
import { insertL2CommitmentSchema } from "@shared/schema";
import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import * as tinysecp256k1 from "tiny-secp256k1";
import { Taptree } from "bitcoinjs-lib/src/types";
import dotenv from "dotenv";

// Initialize environment variables
dotenv.config();

// Initialize ECC library for Bitcoin
bitcoin.initEccLib(tinysecp256k1);

// Bitcoin Taproot address generation function
function generateTaprootAddress(userPublicKey: string, network = bitcoin.networks.testnet): string {
  try {
    const bytestreamPublicKey = process.env.BYTE_PUB_KEY;
    const internalKey = process.env.INTERNAL_KEY;

    if (!internalKey) {
      throw new Error("INTERNAL_KEY environment variable is not set");
    }
    const internalKeyBuffer = Buffer.from(internalKey, "hex");

    // Derive internal x-only pubkey from private scalar
    const internalPub = tinysecp256k1.pointFromScalar(internalKeyBuffer, true); // compressed (33 bytes)
    if (!internalPub) {
      throw new Error("Failed to derive internal pubkey");
    }
    
    const internalPubBuffer = Buffer.from(internalPub);
    
    // Get parity bit (0 if y is even, 1 if y is odd)
    // The full pubkey is 33 bytes: [prefix][x-coord]
    // prefix 0x02 = even y, prefix 0x03 = odd y
    const keyParity = internalPubBuffer[0] === 0x03 ? 1 : 0;
    
    const internalX = internalPubBuffer.slice(1, 33); // x-only

    // Convert hex public keys to buffers
    if (!bytestreamPublicKey || !userPublicKey) {
      throw new Error("Both bytestreamPublicKey and userPublicKey are required");
    }
    
    const keyABuffer = Buffer.from(bytestreamPublicKey, "hex");
    const keyBBuffer = Buffer.from(userPublicKey, "hex");

    // Ensure the provided public keys are x-only (32 bytes) for Taproot script-path
    // Accept either 33-byte compressed pubkeys or already x-only 32-byte buffers
    const toXOnly = (pk: Buffer) => {
      if (!Buffer.isBuffer(pk)) pk = Buffer.from(pk);
      if (pk.length === 33) return pk.slice(1, 33);
      if (pk.length === 32) return pk;
      throw new Error("Unsupported public key length: " + pk.length);
    };

    const keyAX = toXOnly(keyABuffer);
    const keyBX = toXOnly(keyBBuffer);

    const multisigScript = bitcoin.script.compile([
      keyAX,
      bitcoin.opcodes.OP_CHECKSIGVERIFY,
      keyBX,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const timelockScript = bitcoin.script.compile([
      bitcoin.script.number.encode(5),
      bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      bitcoin.opcodes.OP_DROP,
      keyAX,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const scriptTree: Taptree = [
      {
        output: multisigScript,
        version: 192,
      },
      {
        output: timelockScript,
        version: 192,
      },
    ];

    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: internalX,
      scriptTree: scriptTree,
      network: network,
    });

    if (!p2tr.address) {
      throw new Error("Failed to generate Taproot address");
    }

    console.log("Generated Taproot Address:", p2tr.address);
    return p2tr.address;
  } catch (error) {
    console.error("Error generating Taproot address:", error);
    throw error;
  }
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

      const bytestreamPublicKey = process.env.BYTE_PUB_KEY;

      const taprootAddress = generateTaprootAddress(userPublicKey);

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

  // === L2 Commitment Routes ===

  // Create L2 commitment with unsigned PSBT
  app.post("/api/l2-commitments", async (req, res) => {
    try {
      const data = insertL2CommitmentSchema.parse(req.body);
      const commitment = await storage.createL2Commitment(data);
      res.status(201).json(commitment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid commitment data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create commitment" });
    }
  });

  // Get latest L2 commitment for a wallet
  app.get("/api/wallets/:walletId/l2-commitments/latest", async (req, res) => {
    try {
      const commitment = await storage.getLatestL2CommitmentByWalletId(req.params.walletId);
      if (!commitment) {
        return res.status(404).json({ error: "No commitment found" });
      }
      res.json(commitment);
    } catch {
      res.status(500).json({ error: "Failed to fetch commitment" });
    }
  });

  // Update L2 commitment with user-signed PSBT
  app.patch("/api/l2-commitments/:id/sign", async (req, res) => {
    try {
      const { userSignedPsbt } = req.body;
      if (!userSignedPsbt) {
        return res.status(400).json({ error: "User signed PSBT is required" });
      }

      const commitment = await storage.getL2Commitment(req.params.id);
      if (!commitment) {
        return res.status(404).json({ error: "Commitment not found" });
      }

      const updated = await storage.updateL2Commitment(req.params.id, {
        userSignedPsbt,
      });

      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update commitment" });
    }
  });

  // Settle L2 commitment on Bitcoin L1
  app.post("/api/l2-commitments/:id/settle", async (req, res) => {
    try {
      const commitment = await storage.getL2Commitment(req.params.id);
      if (!commitment) {
        return res.status(404).json({ error: "Commitment not found" });
      }

      if (!commitment.userSignedPsbt) {
        return res.status(400).json({ error: "Commitment must be signed by user first" });
      }

      if (commitment.settled === "true") {
        return res.status(400).json({ error: "Commitment already settled" });
      }

      // In production, this would:
      // 1. Sign the PSBT with ByteStream hub private key
      // 2. Finalize the PSBT
      // 3. Extract the signed transaction
      // 4. Broadcast to Bitcoin network
      // For now, simulate the settlement
      const settlementTxid = crypto.randomBytes(32).toString("hex");

      const updated = await storage.updateL2Commitment(req.params.id, {
        settled: "true",
        settlementTxid,
      });

      res.json({
        ...updated,
        message: "Settlement successful",
      });
    } catch {
      res.status(500).json({ error: "Failed to settle commitment" });
    }
  });

  return httpServer;
}
