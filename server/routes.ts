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

// Build Taproot context (address + scripts + control) for multisig/timelock tree
function buildTaprootContext(userPublicKey: string, network = bitcoin.networks.testnet) {
  const bytestreamPublicKey = process.env.BYTE_PUB_KEY;
  const internalKey = process.env.INTERNAL_KEY;

  if (!internalKey) {
    throw new Error("INTERNAL_KEY environment variable is not set");
  }
  const internalKeyBuffer = Buffer.from(internalKey, "hex");

  const internalPub = tinysecp256k1.pointFromScalar(internalKeyBuffer, true);
  if (!internalPub) {
    throw new Error("Failed to derive internal pubkey");
  }

  const internalPubBuffer = Buffer.from(internalPub);
  const keyParity = internalPubBuffer[0] === 0x03 ? 1 : 0;
  const internalX = internalPubBuffer.slice(1, 33);

  if (!bytestreamPublicKey || !userPublicKey) {
    throw new Error("Both bytestreamPublicKey and userPublicKey are required");
  }

  const keyABuffer = Buffer.from(bytestreamPublicKey, "hex");
  const keyBBuffer = Buffer.from(userPublicKey, "hex");

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
    { output: multisigScript, version: 192 },
    { output: timelockScript, version: 192 },
  ];

  const p2tr = bitcoin.payments.p2tr({
    internalPubkey: internalX,
    scriptTree: scriptTree,
    redeem: {
      output: multisigScript,
    },
    network,
  });

  if (!p2tr.address || !p2tr.output || !p2tr.witness || p2tr.witness.length === 0) {
    throw new Error("Failed to build Taproot context");
  }

  return {
    address: p2tr.address,
    outputScript: p2tr.output,
    internalKey: internalKeyBuffer.toString("hex"),
    internalPubkey: internalX,
    internalKeyParity: keyParity,
    scripts: {
      multisig: multisigScript,
      timelock: timelockScript,
    },
    tree: scriptTree,
    control: p2tr.witness,
    leafVersion: 192,
  };
}

async function getBitcoinTxStatus(txid: string): Promise<{ confirmed: boolean; confirmations: number; blockHeight?: number }> {
  try {
    // Get transaction details
    let response = await fetch(`https://mempool.space/testnet/api/tx/${txid}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!response.ok) {
      return { confirmed: false, confirmations: 0 };
    }

    let txData = await response.json();

    if (txData.error || !txData.status) {
      return { confirmed: false, confirmations: 0 };
    }

    // Check if transaction is confirmed
    const confirmed = txData.status.confirmed;
    const blockHeight = txData.status.block_height;

    if (!confirmed || !blockHeight) {
      return { confirmed: false, confirmations: 0 };
    }

    // Get current blockchain tip to calculate confirmations
    response = await fetch(`https://mempool.space/testnet/api/blocks/tip/height`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });

    if (!response.ok) {
      // If we can't get tip, but tx is confirmed, return 1+ confirmation
      return { confirmed: true, confirmations: 1, blockHeight };
    }

    const currentHeight = await response.json();
    const confirmations = currentHeight - blockHeight + 1;
  
    return {
      confirmed: true,
      confirmations: Math.max(1, confirmations),
      blockHeight,
    };
  } catch (error) {
    console.error("Error checking tx status:", error);
    return { confirmed: false, confirmations: 0 };
  }
}

// Monitor deposits to a Taproot address and store confirmed transactions
async function monitorAndStoreDeposits(walletId: string, taprootAddress: string): Promise<{ newTransactions: number; totalAmount: number }> {
  try {
    const base = "https://mempool.space/testnet/api";
    
    // Fetch all transactions for the Taproot address
    const txsResponse = await fetch(`${base}/address/${taprootAddress}/txs`, {
      headers: { "Content-Type": "application/json" }
    });
    
    if (!txsResponse.ok) {
      console.error("Failed to fetch transactions for address:", taprootAddress);
      return { newTransactions: 0, totalAmount: 0 };
    }
    
    const txs = await txsResponse.json();
    
    if (!Array.isArray(txs)) {
      return { newTransactions: 0, totalAmount: 0 };
    }
    
    // Get existing transactions for this wallet to avoid duplicates
    const existingTxs = await storage.getTransactionsByWalletId(walletId);
    const existingTxIds = new Set(existingTxs.map(tx => tx.txid));
    const existingTxMap = new Map(existingTxs.map(tx => [tx.txid, tx]));
    
    let newTransactions = 0;
    let totalAmount = 0;
    
    // Process each transaction
    for (const tx of txs) {
      // Calculate amount received by this address in this transaction
      let amountReceived = 0;
      
      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === taprootAddress) {
          amountReceived += vout.value;
        }
      }
      
      if (amountReceived === 0) {
        continue;
      }
      
      // Convert satoshis to BTC
      const amountBTC = (amountReceived / 100000000).toFixed(8);
      
      // Check if transaction is confirmed
      const txStatus = await getBitcoinTxStatus(tx.txid);
      const status = txStatus.confirmed ? "confirmed" : "pending";
      
      // Get transaction timestamp (block_time for confirmed, current time for pending)
      let txTimestamp: Date;
      if (tx.status?.block_time) {
        txTimestamp = new Date(tx.status.block_time * 1000); // Convert Unix timestamp to milliseconds
      } else {
        txTimestamp = new Date(); // Use current time for pending transactions
      }
      
      if (existingTxIds.has(tx.txid)) {
        // Update existing transaction status if it changed
        const existingTx = existingTxMap.get(tx.txid);
        if (existingTx && existingTx.status !== status) {
          try {
            await storage.updateTransaction(existingTx.id, {
              status,
              confirmations: txStatus.confirmations,
            });
            console.log(`Updated transaction ${tx.txid} status to ${status}`);
          } catch (error) {
            console.error(`Failed to update transaction ${tx.txid}:`, error);
          }
        }
      } else {
        // Store new transaction
        try {
          await storage.createTransaction({
            walletId,
            txid: tx.txid,
            amount: amountBTC,
            status,
            confirmations: txStatus.confirmations,
            createdAt: txTimestamp,
          });
          
          newTransactions++;
          if (status === "confirmed") {
            totalAmount += amountReceived;
          }
          
          console.log(`Stored deposit transaction ${tx.txid} for wallet ${walletId}: ${amountBTC} BTC (${status})`);
        } catch (error) {
          console.error(`Failed to store transaction ${tx.txid}:`, error);
        }
      }
    }
    
    return { newTransactions, totalAmount: totalAmount / 100000000 };
  } catch (error) {
    console.error("Error monitoring deposits:", error);
    return { newTransactions: 0, totalAmount: 0 };
  }
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
      console.error("Create wallet error:", error);
      res.status(500).json({ error: "Failed to create wallet", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get wallet by ID
  app.get("/api/wallets/:id", async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.params.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Automatically check for new deposits if wallet has taproot address
      if (wallet.taprootAddress) {
        await monitorAndStoreDeposits(wallet.id, wallet.taprootAddress);
      }

      // Calculate correct L2 balance: funded amount - total commitments
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed");
      const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

      const commitments = await storage.getL2CommitmentsByWalletId(wallet.id);
      const totalCommitted = commitments.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);

      const correctBalance = (totalFunded - totalCommitted).toFixed(8);

      // Update stored balance if different
      if (wallet.l2Balance !== correctBalance) {
        await storage.updateWallet(wallet.id, { l2Balance: correctBalance });
      }

      res.json({ ...wallet, l2Balance: correctBalance });
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

      // Automatically check for new deposits if wallet has taproot address
      if (wallet.taprootAddress) {
        await monitorAndStoreDeposits(wallet.id, wallet.taprootAddress);
      }

      // Calculate correct L2 balance: funded amount - total commitments
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed");
      const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

      const commitments = await storage.getL2CommitmentsByWalletId(wallet.id);
      const totalCommitted = commitments.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);

      const correctBalance = (totalFunded - totalCommitted).toFixed(8);

      // Update stored balance if different
      if (wallet.l2Balance !== correctBalance) {
        await storage.updateWallet(wallet.id, { l2Balance: correctBalance });
      }

      res.json({ ...wallet, l2Balance: correctBalance });
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

  // Check for deposits on a wallet's Taproot address
  app.post("/api/wallets/:id/check-deposits", async (req, res) => {
    try {
      const wallet = await storage.getWallet(req.params.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      if (!wallet.taprootAddress) {
        return res.status(400).json({ error: "Wallet does not have a Taproot address" });
      }

      // Monitor and store any new deposits
      const result = await monitorAndStoreDeposits(wallet.id, wallet.taprootAddress);

      // Recalculate balance
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed");
      const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

      const commitments = await storage.getL2CommitmentsByWalletId(wallet.id);
      const totalCommitted = commitments.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);

      const correctBalance = (totalFunded - totalCommitted).toFixed(8);

      // Update stored balance
      if (wallet.l2Balance !== correctBalance) {
        await storage.updateWallet(wallet.id, { l2Balance: correctBalance });
      }

      res.json({
        newTransactions: result.newTransactions,
        totalAmount: result.totalAmount,
        currentBalance: correctBalance,
        wallet: { ...wallet, l2Balance: correctBalance }
      });
    } catch (error) {
      console.error("Check deposits error:", error);
      res.status(500).json({ error: "Failed to check deposits" });
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
      const status = await getBitcoinTxStatus(tx.txid);

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
      // Get wallet to check for new deposits
      const wallet = await storage.getWallet(req.params.walletId);
      
      // Monitor for deposits if wallet has a Taproot address
      if (wallet?.taprootAddress) {
        await monitorAndStoreDeposits(req.params.walletId, wallet.taprootAddress);
      }
      
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

      const { amount, payerWalletId } = req.body as { amount: string; payerWalletId?: string };
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      if (!payerWalletId) {
        return res.status(400).json({ error: "Payer wallet is required" });
      }

      // Deduct from payer's L2 balance
      const payerWallet = await storage.getWallet(payerWalletId);
      if (!payerWallet) {
        return res.status(404).json({ error: "Payer wallet not found" });
      }

      const currentBalance = parseFloat(payerWallet.l2Balance || "0");
      const paymentAmount = parseFloat(amount);

      if (paymentAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient L2 balance" });
      }

      const newBalance = (currentBalance - paymentAmount).toFixed(8);
      const updated = await storage.updateWallet(payerWallet.id, { l2Balance: newBalance });

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

      // Deduct payer L2 balance when creating the commitment
      const wallet = await storage.getWallet(data.walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      const amountNum = parseFloat(String(data.amount));
      const currentBalance = parseFloat(wallet.l2Balance || "0");
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "Invalid commitment amount" });
      }
      if (amountNum > currentBalance) {
        return res.status(400).json({ error: "Insufficient L2 balance" });
      }

      const newBalance = (currentBalance - amountNum).toFixed(8);
      await storage.updateWallet(wallet.id, { l2Balance: newBalance });

      const commitment = await storage.createL2Commitment(data);
      res.status(201).json({ ...commitment, payerBalance: newBalance });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid commitment data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create commitment" });
    }
  });

  // === PSBT Creation (Taproot UTXOs) ===
  app.post("/api/psbt", async (req, res) => {
    try {
      const { walletId, sendTo, amount, outputs, network: net } = req.body as {
        walletId: string;
        sendTo?: string;
        amount?: number;
        outputs?: Array<{ address: string; amount: number }>;
        network?: "mainnet" | "testnet";
      };

      const hasOutputsArray = Array.isArray(outputs) && outputs.length > 0;
      if (!walletId || (!hasOutputsArray && (!sendTo || !amount))) {
        return res.status(400).json({ error: "Invalid PSBT request" });
      }
      if (!hasOutputsArray && amount && amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const wallet = await storage.getWallet(walletId);
      if (!wallet || !wallet.taprootAddress || !wallet.userPublicKey) {
        return res.status(404).json({ error: "Wallet, Taproot address, or user public key not found" });
      }
      const tapCtx = buildTaprootContext(wallet.userPublicKey, net === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet);
      if (tapCtx.address !== wallet.taprootAddress) {
        return res.status(400).json({ error: "Stored taproot address does not match constructed address" });
      }
      const addressToUse = tapCtx.address;

      const network = net === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

      // Fetch UTXOs from mempool.space
      const base = net === "mainnet" ? "https://mempool.space/api" : "https://mempool.space/testnet/api";
      const utxoResp = await fetch(`${base}/address/${addressToUse}/utxo`, { headers: { "Content-Type": "application/json" } });
      if (!utxoResp.ok) {
        return res.status(502).json({ error: "Failed to fetch UTXOs" });
      }
      const utxos: Array<{ txid: string; vout: number; value: number; }> = await utxoResp.json();
      if (!Array.isArray(utxos) || utxos.length === 0) {
        return res.status(400).json({ error: "No UTXOs available" });
      }

      // Build output script for the Taproot address (witnessUtxo.script)
      const outputScript = tapCtx.outputScript;

      // Simple fee estimate (placeholder): 1000 sats fixed
      const fee = BigInt(300);
      let accumulated = BigInt(0);

      const desiredOutputs = hasOutputsArray
        ? outputs!.map((o) => ({ address: o.address, value: BigInt(o.amount) }))
        : [{ address: sendTo as string, value: BigInt(amount as number) }];

      const totalOutput = desiredOutputs.reduce((sum, o) => sum + o.value, BigInt(0));

      const psbt = new bitcoin.Psbt({ network });

      for (const utxo of utxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: outputScript,
            value: BigInt(utxo.value),
          },
          tapLeafScript: [
            {
              leafVersion: tapCtx.leafVersion ?? 192,
              script: tapCtx.scripts.multisig,
              controlBlock: tapCtx.control[tapCtx.control.length - 1],
            },
          ],
        });
        accumulated += BigInt(utxo.value);
      }

      if (accumulated < totalOutput + fee) {
        return res.status(400).json({ error: "Insufficient funds for amount + fee" });
      }

      // Add recipient output
      for (const out of desiredOutputs) {
        psbt.addOutput({ address: out.address, value: out.value });
      }

      // Change back to sender taproot address
      const change = accumulated - totalOutput - fee;
      if (change > 0) {
        psbt.addOutput({ address: addressToUse, value: change });
      }

      const psbtHex = psbt.toHex();
      return res.status(200).json({
        psbt: psbtHex,
        fee: Number(fee),
        inputs: utxos.length,
        accumulated: Number(accumulated),
        change: Number(change),
      });
    } catch (error) {
      console.error("PSBT creation error:", error);
      return res.status(500).json({ error: "Failed to create PSBT" });
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

  // Get all L2 commitments for a wallet (History)
  app.get("/api/wallets/:walletId/l2-commitments", async (req, res) => {
    try {
      const commitments = await storage.getL2CommitmentsByWalletId(req.params.walletId);
      res.json(commitments);
    } catch {
      res.status(500).json({ error: "Failed to fetch commitments" });
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
