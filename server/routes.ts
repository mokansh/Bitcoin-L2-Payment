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

const ecc = tinysecp256k1;

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
    console.log("KEYAX:", keyAX.toString("hex"));

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
  console.log("Key A Buffer:", keyABuffer.toString("hex"));
  const keyAX = toXOnly(keyABuffer);
  console.log("KEYAX:", keyAX.toString("hex"));
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

// Check for pending settlements and update them if confirmed or failed
async function checkAndUpdatePendingSettlements(walletId: string): Promise<boolean> {
  try {
    const wallet = await storage.getWallet(walletId);
    if (!wallet) return false;

    const commitments = await storage.getL2CommitmentsByWalletId(walletId);
    
    // Find settlements that are marked as settled but don't have settlementConfirmedAt yet
    const pendingSettlements = commitments.filter(c => 
      c.settled === "true" && 
      c.settlementTxid && 
      !c.settlementConfirmedAt
    );
    
    if (pendingSettlements.length === 0) {
      // No pending settlements, clear lock if it exists
      if (wallet.settlementInProgress === "true") {
        await storage.updateWallet(walletId, { 
          settlementInProgress: "false",
          pendingSettlementTxid: null 
        });
      }
      return false;
    }
    
    let updated = false;
    
    for (const commitment of pendingSettlements) {
      const txid = commitment.settlementTxid;
      
      // Check if settlement transaction is confirmed or failed
      try {
        const txResp = await fetch(`https://mempool.space/testnet/api/tx/${txid}`);
        
        if (!txResp.ok) {
          // Transaction not found - might have been dropped from mempool (failed)
          console.log(`Settlement tx ${txid} not found, considering it failed`);
          
          // Mark commitments as unsettled
          const relatedCommitments = commitments.filter(c => c.settlementTxid === txid);
          for (const c of relatedCommitments) {
            await storage.updateL2Commitment(c.id, {
              settled: "false",
              settlementTxid: null,
            });
          }
          
          // Clear settlement lock - user can spend again
          await storage.updateWallet(walletId, { 
            settlementInProgress: "false",
            pendingSettlementTxid: null 
          });
          
          updated = true;
          continue;
        }
        
        const txData = await txResp.json();
        
        // Check if transaction is confirmed
        if (txData.status?.confirmed && txData.status?.block_time) {
          const settlementConfirmedAt = new Date(txData.status.block_time * 1000);
          
          // Update all commitments with the same settlement txid
          const relatedCommitments = commitments.filter(c => c.settlementTxid === txid);
          for (const c of relatedCommitments) {
            await storage.updateL2Commitment(c.id, {
              settlementConfirmedAt,
            });
          }
          
          // Mark all deposits confirmed before settlement as consumed
          const allTransactions = await storage.getTransactionsByWalletId(walletId);
          for (const tx of allTransactions) {
            if (tx.status === "confirmed" && tx.confirmedAt && tx.consumed !== "true") {
              const txConfirmedAt = new Date(tx.confirmedAt);
              if (txConfirmedAt <= settlementConfirmedAt) {
                await storage.updateTransaction(tx.id, { consumed: "true" });
              }
            }
          }
          
          // Reset wallet balance to 0 and clear settlement lock
          await storage.updateWallet(walletId, { 
            l2Balance: "0",
            settlementInProgress: "false",
            pendingSettlementTxid: null 
          });
          
          updated = true;
          console.log(`Updated pending settlement ${txid} with confirmation time ${settlementConfirmedAt}`);
        }
      } catch (error) {
        console.error(`Error fetching settlement tx ${txid}:`, error);
      }
    }
    
    return updated;
  } catch (error) {
    console.error("Error checking pending settlements:", error);
    return false;
  }
}

// Check all wallets for pending settlements on server startup
export async function checkAllPendingSettlements(): Promise<void> {
  try {
    console.log("Checking all wallets for pending settlements...");
    
    // Get all wallets from storage
    const allWallets = await storage.getAllWallets();
    
    if (!allWallets || allWallets.length === 0) {
      console.log("No wallets found");
      return;
    }
    
    let totalChecked = 0;
    let totalUpdated = 0;
    
    for (const wallet of allWallets) {
      totalChecked++;
      const updated = await checkAndUpdatePendingSettlements(wallet.id);
      if (updated) {
        totalUpdated++;
        console.log(`✓ Updated pending settlements for wallet ${wallet.bitcoinAddress}`);
      }
    }
    
    console.log(`Checked ${totalChecked} wallets, updated ${totalUpdated} with confirmed/failed settlements`);
  } catch (error) {
    console.error("Error checking all pending settlements:", error);
  }
}

// Monitor deposits to a Taproot address and store confirmed transactions
async function recalculateAndUpdateL2Balance(walletId: string): Promise<string> {
  try {
    const wallet = await storage.getWallet(walletId);
    if (!wallet) {
      return "0.00000000";
    }

    // Calculate correct L2 balance: funded amount - total commitments
    const transactions = await storage.getTransactionsByWalletId(walletId);
    const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed" && tx.consumed !== "true");
    
    const commitments = await storage.getL2CommitmentsByWalletId(walletId);
    const settledCommitments = commitments.filter(c => c.settled === "true");
    
    let correctBalance: string = "0.00000000";
    
    if (settledCommitments.length > 0) {
      // Get the latest settlement based on blockchain confirmation time
      const latestSettlementCommitment = settledCommitments.reduce((latest, c) => {
        if (!c.settlementConfirmedAt) return latest;
        const confirmTime = new Date(c.settlementConfirmedAt);
        return !latest || confirmTime > latest.date ? { date: confirmTime, commitment: c } : latest;
      }, null as { date: Date; commitment: any } | null);
      
      if (latestSettlementCommitment) {
        const settlementConfirmTime = latestSettlementCommitment.date;
        
        // Only count deposits that were CONFIRMED AFTER the settlement confirmation
        const depositsAfterSettlement = confirmedTxs.filter(tx => {
          if (!tx.confirmedAt) return false;
          const txConfirmedAt = new Date(tx.confirmedAt);
          return txConfirmedAt > settlementConfirmTime;
        });
        
        const totalFundedAfterSettlement = depositsAfterSettlement.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        
        // Only count unsettled commitments
        const unsettledCommitments = commitments.filter(c => c.settled === "false");
        const totalCommitted = unsettledCommitments.reduce((sum, c) => {
          const amount = parseFloat(String(c.amount));
          const fee = parseFloat(String(c.fee || "0"));
          return sum + amount + fee;
        }, 0);
        
        correctBalance = (totalFundedAfterSettlement - totalCommitted).toFixed(8);
      }
    } else {
      // No settlements yet - calculate from all deposits
      const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
      const unsettledCommitments = commitments.filter(c => c.settled === "false");
      const totalCommitted = unsettledCommitments.reduce((sum, c) => {
        const amount = parseFloat(String(c.amount));
        const fee = parseFloat(String(c.fee || "0"));
        return sum + amount + fee;
      }, 0);
      correctBalance = (totalFunded - totalCommitted).toFixed(8);
    }
    
    // Update stored balance if different
    if (wallet.l2Balance !== correctBalance) {
      await storage.updateWallet(walletId, { l2Balance: correctBalance });
      console.log(`Updated L2 balance for wallet ${walletId}: ${wallet.l2Balance} -> ${correctBalance}`);
    }

    return correctBalance;
  } catch (error) {
    console.error("Error recalculating L2 balance:", error);
    return "0.00000000";
  }
}

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
      let confirmedTimestamp: Date | undefined;
      
      if (tx.status?.block_time) {
        // Use blockchain confirmation time
        confirmedTimestamp = new Date(tx.status.block_time * 1000);
        txTimestamp = confirmedTimestamp;
      } else {
        // Use current time for pending transactions
        txTimestamp = new Date();
        confirmedTimestamp = undefined;
      }
      
      if (existingTxIds.has(tx.txid)) {
        // Update existing transaction status if it changed
        const existingTx = existingTxMap.get(tx.txid);
        if (existingTx) {
          const statusChanged = existingTx.status !== status;
          const needsConfirmedAt = status === "confirmed" && !existingTx.confirmedAt && confirmedTimestamp;
          
          if (statusChanged || needsConfirmedAt) {
            try {
              console.log(`Updating tx ${tx.txid}: statusChanged=${statusChanged}, needsConfirmedAt=${needsConfirmedAt}, confirmedTimestamp=${confirmedTimestamp?.toISOString()}`);
              
              await storage.updateTransaction(existingTx.id, {
                status,
                confirmations: txStatus.confirmations,
                confirmedAt: confirmedTimestamp,
              });
              
              // If transaction just became confirmed or confirmedAt was missing, recalculate L2 balance
              if (statusChanged && status === "confirmed") {
                await recalculateAndUpdateL2Balance(walletId);
                console.log(`Transaction ${tx.txid} confirmed - L2 balance updated`);
              } else if (needsConfirmedAt) {
                await recalculateAndUpdateL2Balance(walletId);
                console.log(`Transaction ${tx.txid} confirmedAt updated - L2 balance recalculated`);
              }
            } catch (error) {
              console.error(`Failed to update transaction ${tx.txid}:`, error);
            }
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
            confirmedAt: confirmedTimestamp,
          });
          
          newTransactions++;
          if (status === "confirmed") {
            totalAmount += amountReceived;
            // Recalculate L2 balance immediately for confirmed deposits
            await recalculateAndUpdateL2Balance(walletId);
            console.log(`New confirmed deposit ${tx.txid} - L2 balance updated`);
          }
          
          // console.log(`Stored deposit transaction ${tx.txid} for wallet ${walletId}: ${amountBTC} BTC (${status})`);
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

      // Check for pending settlements and update if confirmed
      await checkAndUpdatePendingSettlements(wallet.id);

      // Automatically check for new deposits if wallet has taproot address
      if (wallet.taprootAddress) {
        await monitorAndStoreDeposits(wallet.id, wallet.taprootAddress);
      }

      // Calculate correct L2 balance: funded amount - total commitments
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed" && tx.consumed !== "true");
      
      const commitments = await storage.getL2CommitmentsByWalletId(wallet.id);
      const settledCommitments = commitments.filter(c => c.settled === "true");
      
      let correctBalance: string = "0.00000000";
      
      if (settledCommitments.length > 0) {
        // Get the latest settlement based on blockchain confirmation time
        const latestSettlementCommitment = settledCommitments.reduce((latest, c) => {
          if (!c.settlementConfirmedAt) return latest;
          const confirmTime = new Date(c.settlementConfirmedAt);
          return !latest || confirmTime > latest.date ? { date: confirmTime, commitment: c } : latest;
        }, null as { date: Date; commitment: any } | null);
        
        if (latestSettlementCommitment) {
          const settlementConfirmTime = latestSettlementCommitment.date;
          
          // Only count deposits that were CONFIRMED AFTER the settlement confirmation
          // Deposits confirmed before settlement were consumed by it
          const depositsAfterSettlement = confirmedTxs.filter(tx => {
            if (!tx.confirmedAt) return false;
            const txConfirmedAt = new Date(tx.confirmedAt);
            return txConfirmedAt > settlementConfirmTime;
          });
          
          const totalFundedAfterSettlement = depositsAfterSettlement.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
          
          // Only count unsettled commitments
          const unsettledCommitments = commitments.filter(c => c.settled === "false");
          const totalCommitted = unsettledCommitments.reduce((sum, c) => {
            const amount = parseFloat(String(c.amount));
            const fee = parseFloat(String(c.fee || "0"));
            return sum + amount + fee;
          }, 0);
          
          // Balance = deposits after settlement - unsettled commitments
          correctBalance = (totalFundedAfterSettlement - totalCommitted).toFixed(8);
        }
      } else {
        // No settlements yet - calculate from all deposits
        const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        const unsettledCommitments = commitments.filter(c => c.settled === "false");
        const totalCommitted = unsettledCommitments.reduce((sum, c) => {
          const amount = parseFloat(String(c.amount));
          const fee = parseFloat(String(c.fee || "0"));
          return sum + amount + fee;
        }, 0);
        correctBalance = (totalFunded - totalCommitted).toFixed(8);
      }
      
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

      // Check for pending settlements and update if confirmed
      await checkAndUpdatePendingSettlements(wallet.id);

      // Automatically check for new deposits if wallet has taproot address
      if (wallet.taprootAddress) {
        await monitorAndStoreDeposits(wallet.id, wallet.taprootAddress);
      }

      // Calculate correct L2 balance: funded amount - total commitments
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed" && tx.consumed !== "true");
      
      const commitments = await storage.getL2CommitmentsByWalletId(wallet.id);
      const settledCommitments = commitments.filter(c => c.settled === "true");
      
      let correctBalance: string = "0.00000000";
      
      if (settledCommitments.length > 0) {
        // Get the latest settlement based on blockchain confirmation time
        const latestSettlementCommitment = settledCommitments.reduce((latest, c) => {
          if (!c.settlementConfirmedAt) return latest;
          const confirmTime = new Date(c.settlementConfirmedAt);
          return !latest || confirmTime > latest.date ? { date: confirmTime, commitment: c } : latest;
        }, null as { date: Date; commitment: any } | null);
        
        if (latestSettlementCommitment) {
          const settlementConfirmTime = latestSettlementCommitment.date;
          
          // Only count deposits that were CONFIRMED AFTER the settlement confirmation
          // Deposits confirmed before settlement were already consumed by it
          const depositsAfterSettlement = confirmedTxs.filter(tx => {
            if (!tx.confirmedAt) return false; // Skip unconfirmed
            const txConfirmedAt = new Date(tx.confirmedAt);
            return txConfirmedAt > settlementConfirmTime;
          });
          
          const totalFundedAfterSettlement = depositsAfterSettlement.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
          
          // Only count unsettled commitments
          const unsettledCommitments = commitments.filter(c => c.settled === "false");
          const totalCommitted = unsettledCommitments.reduce((sum, c) => {
            const amount = parseFloat(String(c.amount));
            const fee = parseFloat(String(c.fee || "0"));
            return sum + amount + fee;
          }, 0);
          
          // Balance = deposits after settlement - unsettled commitments
          correctBalance = (totalFundedAfterSettlement - totalCommitted).toFixed(8);
        }
      } else {
        // No settlements yet - calculate from all deposits
        const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        const unsettledCommitments = commitments.filter(c => c.settled === "false");
        const totalCommitted = unsettledCommitments.reduce((sum, c) => {
          const amount = parseFloat(String(c.amount));
          const fee = parseFloat(String(c.fee || "0"));
          return sum + amount + fee;
        }, 0);
        correctBalance = (totalFunded - totalCommitted).toFixed(8);
      }
      
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

      // Check if settlement is in progress
      if (payerWallet.settlementInProgress === "true") {
        return res.status(400).json({ 
          error: "Settlement in progress",
          details: "Cannot make payments while settlement is being processed",
          pendingSettlementTxid: payerWallet.pendingSettlementTxid
        });
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

      // Calculate fee from PSBT
      const psbt = bitcoin.Psbt.fromHex(data.psbt);
      
      // Calculate total inputs
      let totalInput = BigInt(0);
      for (const input of psbt.data.inputs) {
        if (input.witnessUtxo) {
          totalInput += BigInt(input.witnessUtxo.value);
        }
      }
      
      // Calculate total outputs
      let totalOutput = BigInt(0);
      for (const output of psbt.txOutputs) {
        totalOutput += BigInt(output.value);
      }
      
      // Fee is the difference between inputs and outputs
      const feeInSats = Number(totalInput - totalOutput);
      const feeInBTC = (feeInSats / 100000000).toFixed(8);

      // Deduct payer L2 balance when creating the commitment (amount + fee)
      const wallet = await storage.getWallet(data.walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Check if settlement is in progress
      if (wallet.settlementInProgress === "true") {
        return res.status(400).json({ 
          error: "Settlement in progress",
          details: "Cannot create new commitments while settlement is being processed",
          pendingSettlementTxid: wallet.pendingSettlementTxid
        });
      }

      // Convert to satoshis for precise integer arithmetic
      const amountNum = parseFloat(String(data.amount));
      console.log("Commitment amount:", amountNum, "Fee in BTC:", feeInBTC);
      const feeNum = parseFloat(feeInBTC);
      const currentBalance = parseFloat(wallet.l2Balance || "0");
      
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "Invalid commitment amount" });
      }
      
      // Work in satoshis (integers) to avoid floating-point precision errors
      const amountSats = Math.round(amountNum * 100000000);
      const feeSats = Math.round(feeNum * 100000000);
      const currentBalanceSats = Math.round(currentBalance * 100000000);
      const totalDeductionSats = amountSats + feeSats;
      
      // Convert back to BTC for display and comparison (8 decimal places)
      const totalDeduction = (totalDeductionSats / 100000000).toFixed(8);
      console.log("Total deduction (amount + fee):", totalDeduction, "Current balance:", currentBalance);
      
      if (totalDeductionSats > currentBalanceSats) {
        return res.status(400).json({ 
          error: "Insufficient L2 balance",
          details: {
            required: (totalDeductionSats / 100000000).toFixed(8),
            available: (currentBalanceSats / 100000000).toFixed(8),
            amount: (amountSats / 100000000).toFixed(8),
            fee: (feeSats / 100000000).toFixed(8)
          }
        });
      }

      const newBalanceSats = currentBalanceSats - totalDeductionSats;
      const newBalance = (newBalanceSats / 100000000).toFixed(8);
      await storage.updateWallet(wallet.id, { l2Balance: newBalance });

      // Create commitment with fee
      const commitment = await storage.createL2Commitment({
        ...data,
        fee: feeInBTC
      });
      
      res.status(201).json({ 
        ...commitment, 
        payerBalance: newBalance,
        feeDeducted: feeInBTC
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid commitment data", details: error.errors });
      }
      console.error("Error creating commitment:", error);
      res.status(500).json({ error: "Failed to create commitment" });
    }
  });

  // === PSBT Creation (Taproot UTXOs) ===
  app.post("/api/psbt", async (req, res) => {
    try {
      const { walletId, sendTo, amount, outputs, network: net, includeMerchantBalances } = req.body as {
        walletId: string;
        sendTo?: string;
        amount?: number;
        outputs?: Array<{ address: string; amount: number }>;
        network?: "mainnet" | "testnet";
        includeMerchantBalances?: boolean;
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
      const utxoUrl = `${base}/address/${addressToUse}/utxo`;
      
      let utxos: Array<{ txid: string; vout: number; value: number; }> = [];
      
      try {
        const utxoResp = await fetch(utxoUrl, { headers: { "Content-Type": "application/json" } });
        if (!utxoResp.ok) {
          console.error(`Failed to fetch UTXOs from ${utxoUrl}: ${utxoResp.status} ${utxoResp.statusText}`);
          const errorText = await utxoResp.text();
          console.error(`Response body: ${errorText}`);
          return res.status(502).json({ error: "Failed to fetch UTXOs", details: `${utxoResp.status} ${utxoResp.statusText}` });
        }
        utxos = await utxoResp.json();
        if (!Array.isArray(utxos) || utxos.length === 0) {
          return res.status(400).json({ error: "No UTXOs available" });
        }
      } catch (fetchError) {
        console.error(`Error fetching UTXOs from ${utxoUrl}:`, fetchError);
        return res.status(502).json({ error: "Failed to fetch UTXOs", details: String(fetchError) });
      }

      // Build output script for the Taproot address (witnessUtxo.script)
      const outputScript = tapCtx.outputScript;

      // Dust threshold for Bitcoin (546 sats is standard, using 540 as requested)
      const DUST_THRESHOLD = BigInt(540);

      // Simple fee estimate (placeholder): 300 sats fixed
      const fee = BigInt(450);
      let accumulated = BigInt(0);

      let desiredOutputs = hasOutputsArray
        ? outputs!.map((o) => ({ address: o.address, value: BigInt(o.amount) }))
        : [{ address: sendTo as string, value: BigInt(amount as number) }];

      // If includeMerchantBalances is true, calculate accumulated balances
      // for merchants associated with this wallet only (not all users).
      if (includeMerchantBalances) {
        // Get unsettled L2 commitments for this wallet only
        const allCommitmentsForWallet = await storage.getL2CommitmentsByWalletId(walletId);
        const unsettledCommitments = allCommitmentsForWallet.filter(c => c.settled === "false");

        // Group commitments by merchant address and calculate totals
        const merchantBalances = new Map<string, bigint>();

        for (const commitment of unsettledCommitments) {
          const merchantAddr = commitment.merchantAddress;
          // commitment.amount is stored as BTC string, convert to satoshis
          const amountInSats = Math.round(parseFloat(String(commitment.amount)) * 100000000);
          const currentBalance = merchantBalances.get(merchantAddr) || BigInt(0);
          merchantBalances.set(merchantAddr, currentBalance + BigInt(amountInSats));
        }

        // Add the current payment to the merchant's accumulated balance (amount is in satoshis)
        if (sendTo && amount) {
          const currentMerchantBalance = merchantBalances.get(sendTo) || BigInt(0);
          merchantBalances.set(sendTo, currentMerchantBalance + BigInt(amount));
        }

        // Convert map to outputs array (only includes merchants this wallet owes)
        desiredOutputs = Array.from(merchantBalances.entries()).map(([address, value]) => ({
          address,
          value,
        }));
      }

      // Filter out dust outputs (below 540 satoshis)
      const filteredOutputs = desiredOutputs.filter(out => out.value >= DUST_THRESHOLD);
      
      if (filteredOutputs.length === 0) {
        return res.status(400).json({ 
          error: "All outputs are below dust threshold (540 sats)",
          details: {
            dustThreshold: Number(DUST_THRESHOLD),
            rejectedOutputs: desiredOutputs.map(o => ({ address: o.address, value: Number(o.value) }))
          }
        });
      }

      const totalOutput = filteredOutputs.reduce((sum, o) => sum + o.value, BigInt(0));

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
        return res.status(400).json({ 
          error: "Insufficient funds for amount + fee",
          details: {
            accumulated: Number(accumulated),
            totalOutput: Number(totalOutput),
            fee: Number(fee),
            required: Number(totalOutput + fee),
            shortfall: Number(totalOutput + fee - accumulated)
          }
        });
      }

      // Add recipient outputs (excluding dust)
      for (const out of filteredOutputs) {
        psbt.addOutput({ address: out.address, value: out.value });
      }

      // Change back to user's connected wallet address (from Unisat)
      const change = accumulated - totalOutput - fee;
      if (change > 0) {
        // Only add change output if it's above dust threshold
        if (change >= DUST_THRESHOLD) {
          psbt.addOutput({ address: wallet.bitcoinAddress, value: change });
        } else {
          // If change is dust, add it to fee instead
          console.log(`Change ${change} sats is dust, adding to fee`);
        }
      }

      // console.log("PSBT Inputs:", psbt.inputCount);

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

  // Get settlement history for a wallet
  app.get("/api/wallets/:walletId/settlements", async (req, res) => {
    try {
      const commitments = await storage.getL2CommitmentsByWalletId(req.params.walletId);
      
      // Group commitments by settlement txid
      const settlementsMap = new Map();
      
      for (const commitment of commitments) {
        if (commitment.settled === "true" && commitment.settlementTxid) {
          if (!settlementsMap.has(commitment.settlementTxid)) {
            settlementsMap.set(commitment.settlementTxid, {
              txid: commitment.settlementTxid,
              confirmedAt: commitment.settlementConfirmedAt,
              commitments: [],
              totalAmount: 0,
              totalFees: 0
            });
          }
          
          const settlement = settlementsMap.get(commitment.settlementTxid);
          settlement.commitments.push({
            id: commitment.id,
            merchantAddress: commitment.merchantAddress,
            amount: commitment.amount,
            fee: commitment.fee,
            createdAt: commitment.createdAt
          });
          settlement.totalAmount += parseFloat(commitment.amount || "0");
          settlement.totalFees += parseFloat(commitment.fee || "0");
        }
      }
      
      // Convert map to array and sort by confirmation time (most recent first)
      const settlements = Array.from(settlementsMap.values())
        .sort((a, b) => {
          const dateA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
          const dateB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
          return dateB - dateA;
        })
        .map(s => ({
          ...s,
          totalAmount: s.totalAmount.toFixed(8),
          totalFees: s.totalFees.toFixed(8),
          commitmentCount: s.commitments.length,
          // Get the latest commitment (most recent)
          latestCommitment: s.commitments.sort((a: any, b: any) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0]
        }));
      
      res.json(settlements);
    } catch (error) {
      console.error("Error fetching settlement history:", error);
      res.status(500).json({ error: "Failed to fetch settlement history" });
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

  // Settle all pending L2 commitments to Bitcoin L1
  app.post("/api/settle-to-l1", async (req, res) => {
    try {
      const { walletId } = req.body;
      if (!walletId) {
        return res.status(400).json({ error: "Wallet ID is required" });
      }

      const wallet = await storage.getWallet(walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Get the latest L2 commitment with user-signed PSBT
      const latestCommitment = await storage.getLatestL2CommitmentByWalletId(walletId);
      if (!latestCommitment) {
        return res.status(404).json({ error: "No L2 commitment found" });
      }

      if (!latestCommitment.userSignedPsbt) {
        return res.status(400).json({ error: "Latest commitment is not signed by user" });
      }

      if (latestCommitment.settled === "true") {
        return res.status(400).json({ error: "Latest commitment already settled" });
      }

      // Get ByteStream hub private key from environment
      const bytestreamPrivateKey = process.env.BYTE_PRIVATE_KEY;
      if (!bytestreamPrivateKey) {
        return res.status(500).json({ error: "ByteStream private key not configured" });
      }

      // Get ByteStream public key for verification
      const bytestreamPublicKey = process.env.BYTE_PUB_KEY;
      if (!bytestreamPublicKey) {
        return res.status(500).json({ error: "ByteStream public key not configured" });
      }

      const network = bitcoin.networks.testnet;
      
      // Parse the user-signed PSBT
      const userSignedPsbt = bitcoin.Psbt.fromHex(latestCommitment.userSignedPsbt, { network });

        // Check if the user's PSBT is already finalized (has finalScriptWitness)
        let isPreFinalized = false;
        for (let i = 0; i < userSignedPsbt.data.inputs.length; i++) {
          const uin = userSignedPsbt.data.inputs[i];
          if (uin.finalScriptWitness) {
            isPreFinalized = true;
            break;
          }
        }

        // Validate that the user's PSBT actually contains their signatures for script-path spends.
        // Some wallets pre-finalize PSBTs (put signatures in finalScriptWitness).
        // Others use standard tapScriptSig or tapKeySig fields.
        if (!isPreFinalized) {
          for (let i = 0; i < userSignedPsbt.data.inputs.length; i++) {
            const uin = userSignedPsbt.data.inputs[i];
            const hasScriptSigs = Array.isArray(uin.tapScriptSig) && uin.tapScriptSig.length > 0;
            const hasKeySig = !!uin.tapKeySig;
            
            if (!hasScriptSigs && !hasKeySig) {
              return res.status(400).json({ error: `User-signed PSBT is missing signatures on input ${i}`, details: { inputIndex: i } });
            }
          }
        }

      // Create Taproot signer for ByteStream hub private key
      const makeTapSigner = (privKey: Buffer) => {
        const pubCompressed = ecc.pointFromScalar(privKey); // 33 bytes compressed
        if (!pubCompressed) throw new Error('bad privKey');
        const xOnly = Buffer.from(pubCompressed).slice(1, 33); // 32 bytes
        
        // Verify the derived public key matches the expected ByteStream public key
        const expectedPubKey = Buffer.from(bytestreamPublicKey, "hex");
        const expectedXOnly = expectedPubKey.length === 33 ? expectedPubKey.slice(1, 33) : expectedPubKey;
        
        if (!xOnly.equals(expectedXOnly)) {
          console.error('ByteStream key mismatch!');
          console.error('Derived x-only:', xOnly.toString('hex'));
          console.error('Expected x-only:', expectedXOnly.toString('hex'));
          throw new Error('ByteStream private key does not match public key');
        }
        
        return {
          // Use compressed pubkey here; psbt expects the Signer.publicKey to match what it checks against
          publicKey: Buffer.from(pubCompressed),
          // Standard ECDSA sign for compatibility (required by Signer interface)
          sign: (hash: Buffer) => {
            const signature = ecc.sign(hash, privKey);
            if (!signature) throw new Error('Failed to sign');
            return Buffer.from(signature);
          },
          // bitcoinjs-lib calls signSchnorr(hash) with hash Buffer(32)
          signSchnorr: (hash: Buffer) => {
            console.log("inside signSchnorr");
            console.log("private key:", privKey.toString('hex'));
            // returns 64-byte signature (tiny-secp256k1.signSchnorr)
            if (typeof ecc.signSchnorr !== 'function') {
              throw new Error('schnorr not supported in tiny-secp256k1 build');
            }
            return ecc.signSchnorr(hash, privKey);
          }
        };
      };

      // Handle pre-finalized PSBTs differently
      if (isPreFinalized) {
        // User wallet has already finalized the PSBT with their signature in finalScriptWitness
        // We need to decode it, add hub signature, re-encode and broadcast
        
        if (!wallet.userPublicKey) {
          return res.status(400).json({ error: "Wallet does not have user public key" });
        }
        
        const tapCtx = buildTaprootContext(wallet.userPublicKey, network);
        
        // Create a fresh PSBT to properly compute sighashes for hub signing
        const psbt = new bitcoin.Psbt({ network });
        
        // Add inputs with tapLeafScript for proper sighash computation
        for (let i = 0; i < userSignedPsbt.txInputs.length; i++) {
          const txInput = userSignedPsbt.txInputs[i];
          const input = userSignedPsbt.data.inputs[i];
          
          psbt.addInput({
            hash: txInput.hash,
            index: txInput.index,
            witnessUtxo: input.witnessUtxo!,
            tapLeafScript: [
              {
                leafVersion: tapCtx.leafVersion ?? 192,
                script: tapCtx.scripts.multisig,
                controlBlock: tapCtx.control[tapCtx.control.length - 1],
              },
            ],
          });
        }
        
        // Copy outputs
        for (const output of userSignedPsbt.txOutputs) {
          psbt.addOutput({
            address: bitcoin.address.fromOutputScript(output.script, network),
            value: BigInt(output.value),
          });
        }
        
        // Sign with hub key to get hub signatures
        const bytestreamSigner = makeTapSigner(Buffer.from(bytestreamPrivateKey, "hex"));
        for (let i = 0; i < psbt.data.inputs.length; i++) {
          psbt.signInput(i, bytestreamSigner);
        }
        
        // Extract user's finalized transaction
        const tx = userSignedPsbt.extractTransaction();
        
        // For each input, get hub's signature from our PSBT and add it to user's witness
        for (let i = 0; i < tx.ins.length; i++) {
          const userWitness = tx.ins[i].witness || [];
          
          if (userWitness.length < 2) {
            return res.status(400).json({ 
              error: `Pre-finalized PSBT input ${i} has invalid witness stack`,
              details: { inputIndex: i, witnessLength: userWitness.length }
            });
          }
          
          const controlBlock = userWitness[userWitness.length - 1];
          const script = userWitness[userWitness.length - 2];
          const userSigs = userWitness.slice(0, -2);
          
          // Get hub's signature from our PSBT
          const hubInput = psbt.data.inputs[i];
          let hubSig: Buffer | undefined;
          
          if (hubInput.tapScriptSig && hubInput.tapScriptSig.length > 0) {
            // Extract signature from tapScriptSig
            const sigEntry = hubInput.tapScriptSig[0];
            if (Buffer.isBuffer(sigEntry)) {
              hubSig = sigEntry;
            } else if (typeof sigEntry === 'object' && 'signature' in sigEntry) {
              hubSig = Buffer.from((sigEntry as any).signature);
            }
          }
          
          if (!hubSig) {
            return res.status(500).json({ 
              error: `Failed to generate hub signature for input ${i}`,
              details: { inputIndex: i }
            });
          }
          
          // Rebuild witness: [userSig, hubSig, script, controlBlock]
          tx.ins[i].witness = [...userSigs, hubSig, script, controlBlock];
        }
        
        const txHex = tx.toHex();
        const txid = tx.getId();
        
        console.log("Pre-finalized transaction with hub signature:", txHex);
        
        // Broadcast transaction
        const broadcastResp = await fetch("https://mempool.space/testnet/api/tx", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: txHex,
        });

        if (!broadcastResp.ok) {
          const errorText = await broadcastResp.text();
          const witnesses = tx.ins.map((inp) => (inp.witness || []).map(w => Buffer.from(w).toString('hex')));
          return res.status(500).json({ error: 'Failed to broadcast pre-finalized transaction', rpc: errorText, txHex, witnesses });
        }

        const broadcastedTxid = await broadcastResp.text();
        const txLink = `https://mempool.space/testnet/tx/${broadcastedTxid}`;
        
        console.log(`Transaction broadcast: ${txLink}`);
        
        // Set settlement lock immediately after broadcast
        await storage.updateWallet(walletId, { 
          settlementInProgress: "true",
          pendingSettlementTxid: broadcastedTxid 
        });
        
        console.log('Waiting for 1 confirmation...');

        // Wait for 1 confirmation
        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 60; // Wait up to 10 minutes (60 * 10s)
        
        while (!confirmed && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          const status = await getBitcoinTxStatus(broadcastedTxid);
          if (status.confirmed && status.confirmations >= 1) {
            confirmed = true;
            console.log(`Transaction confirmed in block ${status.blockHeight}`);
          } else {
            attempts++;
            console.log(`Waiting for confirmation... (attempt ${attempts}/${maxAttempts})`);
          }
        }

        if (!confirmed) {
          // Update commitments but don't reset balance yet
          const allCommitments = await storage.getL2CommitmentsByWalletId(walletId);
          for (const commitment of allCommitments) {
            if (commitment.settled === "false") {
              await storage.updateL2Commitment(commitment.id, {
                settled: "true",
                settlementTxid: broadcastedTxid,
              });
            }
          }
          
          return res.json({
            success: true,
            txid: broadcastedTxid,
            txLink,
            message: "Transaction broadcast but not yet confirmed. L2 balance not reset.",
            confirmed: false,
            txHex,
          });
        }

        // Update all unsettled commitments for this wallet as settled
        const allCommitments = await storage.getL2CommitmentsByWalletId(walletId);
        for (const commitment of allCommitments) {
          if (commitment.settled === "false") {
            await storage.updateL2Commitment(commitment.id, {
              settled: "true",
              settlementTxid: broadcastedTxid,
            });
          }
        }

        // Reset wallet L2 balance to 0 and clear settlement lock
        await storage.updateWallet(walletId, { 
          l2Balance: "0",
          settlementInProgress: "false",
          pendingSettlementTxid: null 
        });

        return res.json({
          success: true,
          txid: broadcastedTxid,
          txLink,
          message: "Successfully settled to L1 (pre-finalized PSBT) and confirmed",
          confirmed: true,
          txHex,
        });
      }
      
      // Rebuild PSBT with same structure as PSBT creation (line 872-888)
      // Get the taproot context for the wallet
      if (!wallet.userPublicKey) {
        return res.status(400).json({ error: "Wallet does not have user public key" });
      }
      
      const tapCtx = buildTaprootContext(wallet.userPublicKey, network);
      const outputScript = Buffer.from(tapCtx.outputScript);
      
      // Create a fresh PSBT with same inputs and outputs
      const psbt = new bitcoin.Psbt({ network });
      
      // Copy all inputs from user-signed PSBT with tapLeafScript.
      // Use the user's tapLeafScript (script, leafVersion, controlBlock) when present
      // — this preserves the exact control block and leaf index the user used.
      for (let i = 0; i < userSignedPsbt.txInputs.length; i++) {
        const txInput = userSignedPsbt.txInputs[i];
        const input = userSignedPsbt.data.inputs[i];

        // Prefer the user's tapLeafScript entry if available
        const userLeaf = Array.isArray(input.tapLeafScript) && input.tapLeafScript.length > 0
          ? input.tapLeafScript[0]
          : undefined;

        const leafVersion = userLeaf?.leafVersion ?? tapCtx.leafVersion ?? 192;
        const script = userLeaf?.script ?? tapCtx.scripts.multisig;
        const controlBlock = userLeaf?.controlBlock ?? tapCtx.control[tapCtx.control.length - 1];

        psbt.addInput({
          hash: txInput.hash,
          index: txInput.index,
          witnessUtxo: input.witnessUtxo!,
          tapLeafScript: [
            {
              leafVersion,
              script,
              controlBlock,
            },
          ],
        });
      }
      
      // Copy all outputs from user-signed PSBT
      for (const output of userSignedPsbt.txOutputs) {
        psbt.addOutput({
          address: bitcoin.address.fromOutputScript(output.script, network),
          value: BigInt(output.value),
        });
      }

      // Sign with ByteStream hub private key (makeTapSigner defined earlier)
      const bytestreamSigner = makeTapSigner(Buffer.from(bytestreamPrivateKey, "hex"));

      // First, copy user's script-path signatures from userSignedPsbt to new psbt
      // NOTE: We intentionally DO NOT copy `tapKeySig` (key-path signatures)
      // because we want to enforce script-path signing only for taproot inputs.
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        const userInput = userSignedPsbt.data.inputs[i];
        // Copy tapScriptSig (Taproot script path signatures)
        if (userInput.tapScriptSig) {
          psbt.data.inputs[i].tapScriptSig = userInput.tapScriptSig;
        }
      }

      // Now sign all inputs with ByteStream key
      console.log("PSBT : ", psbt);
      console.log("psbt.data.inputs.length: ", psbt.data.inputs.length)
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        try {
          // For taproot inputs, just use signInput - it handles both key path and script path
          console.log(`Signing input ${i} with ByteStream key`);
          psbt.signInput(i, bytestreamSigner);
        } catch (error) {
          console.error(`Failed to sign input ${i}:`, error);
          throw error; // Re-throw to prevent finalization with incomplete signatures
        }
      }
      // Remove any tapKeySig (key-path) entries so only script-path signatures remain
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        if (psbt.data.inputs[i].tapKeySig) {
          delete psbt.data.inputs[i].tapKeySig;
        }
      }

      // Finalize inputs with an explicit Taproot script-path finalizer.
      // This builds `finalScriptWitness` as: [ <schnorr sigs...>, <script>, <controlBlock> ]
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        try {
          const input = psbt.data.inputs[i];

          // Only apply custom finalizer for inputs that contain a tapLeafScript
          if (input?.tapLeafScript && input.tapLeafScript.length > 0) {
            const leaf = input.tapLeafScript[0];
            const script = leaf.script;
            const control = leaf.controlBlock;

            // Collect signature-like entries from tapScriptSig (robust to shapes)
            const sigs: Buffer[] = [];
            const tapScriptSig = input.tapScriptSig;
            if (tapScriptSig) {
              if (Array.isArray(tapScriptSig)) {
                for (const s of tapScriptSig) {
                  if (!s) continue;
                  // If element is an object like { signature: Buffer }
                  if (typeof s === 'object' && Buffer.isBuffer((s as any).signature)) {
                    let sigBuf: Buffer = (s as any).signature;
                    if (sigBuf.length === 65) sigBuf = sigBuf.slice(0, 64);
                    sigs.push(sigBuf);
                    continue;
                  }
                  if (Buffer.isBuffer(s)) {
                    let sigBuf: Buffer = s as Buffer;
                    if (sigBuf.length === 65) {
                      // Strip trailing sighash-like byte if present (some signers append it)
                      sigBuf = sigBuf.slice(0, 64);
                      console.log(`Stripped trailing byte from 65-byte signature on input ${i}`);
                    }
                    sigs.push(sigBuf);
                  }
                }
              } else if (Buffer.isBuffer(tapScriptSig)) {
                let sigBuf: Buffer = tapScriptSig as Buffer;
                if (sigBuf.length === 65) sigBuf = sigBuf.slice(0, 64);
                sigs.push(sigBuf);
              }
            }

            // Also attempt to include signatures produced by our signer that may not be in tapScriptSig
            // bitcoinjs-lib usually populates tapScriptSig when signing, but be defensive.

            const finalWitness: Buffer[] = [];
            for (const s of sigs) finalWitness.push(s);
            if (script) finalWitness.push(Buffer.from(script));
            if (control) finalWitness.push(Buffer.from(control));

            // Serialize witness stack into a single Uint8Array: [count][len][data]...[len][data]
            const encodeVarInt = (n: number) => {
              if (n < 0xfd) return Buffer.from([n]);
              if (n <= 0xffff) {
                const b = Buffer.allocUnsafe(3);
                b[0] = 0xfd;
                b.writeUInt16LE(n, 1);
                return b;
              }
              if (n <= 0xffffffff) {
                const b = Buffer.allocUnsafe(5);
                b[0] = 0xfe;
                b.writeUInt32LE(n, 1);
                return b;
              }
              const b = Buffer.allocUnsafe(9);
              b[0] = 0xff;
              // write BigUInt64LE
              b.writeBigUInt64LE(BigInt(n), 1);
              return b;
            };

            const witnessParts: Buffer[] = [];
            witnessParts.push(encodeVarInt(finalWitness.length));
            for (const item of finalWitness) {
              witnessParts.push(encodeVarInt(item.length));
              witnessParts.push(item);
            }
            const finalScriptWitness = Buffer.concat(witnessParts);

            // Use psbt.finalizeInput with custom finalizer that returns the serialized witness
            psbt.finalizeInput(i, () => ({ finalScriptWitness }));
          } else {
            // Fallback: let bitcoinjs-lib finalize other input types
            try {
              psbt.finalizeInput(i);
            } catch (e) {
              // If finalizeInput fails for non-tap inputs, log and rethrow
              console.error(`Failed to finalize input ${i} with default finalizer:`, e);
              throw e;
            }
          }
        } catch (err) {
          console.error(`Error finalizing input ${i}:`, err);
          throw err;
        }
      }

      // Extract the transaction
      const tx = psbt.extractTransaction();
      console.log("Finalized transaction:", tx.toHex());
      const txHex = tx.toHex();
      const txid = tx.getId();

        // Rebuild witness stacks for taproot script-path inputs to ensure correct order:
        // [ <script stack items (signatures)>, <script>, <controlBlock> ]
        try {
          for (let i = 0; i < tx.ins.length; i++) {
            const inputPsbt = psbt.data.inputs[i];
            // Only adjust if we have a tapLeafScript (script-path)
            if (inputPsbt?.tapLeafScript && inputPsbt.tapLeafScript.length > 0) {
              const leaf = inputPsbt.tapLeafScript[0];
              const script = leaf.script;
              const control = leaf.controlBlock;

              // Collect signature-like items from existing witness (64-byte schnorr or 65-byte DER)
              const existingWitness = tx.ins[i].witness || [];
              const sigs: Buffer[] = [];
              for (const w of existingWitness) {
                if (!Buffer.isBuffer(w)) continue;
                if (w.length === 64 || w.length === 65) {
                  sigs.push(w);
                }
              }

              // Rebuild witness: signatures (in original order), then script, then control block
              const newWitness = [...sigs];
              if (script) newWitness.push(Buffer.from(script));
              if (control) newWitness.push(Buffer.from(control));

              // Replace witness for the input
              tx.ins[i].witness = newWitness;
              console.log(`Rebuilt witness for input ${i}: sigs=${sigs.length}, scriptPresent=${!!script}, controlPresent=${!!control}`);
            }
          }
        } catch (rebuildErr) {
          console.error('Error rebuilding witnesses:', rebuildErr);
        }

        // --- Debug: inspect per-input witness stacks and PSBT tap data ---
        try {
          for (let i = 0; i < tx.ins.length; i++) {
            const inputWitness = tx.ins[i].witness || [];
            const inputPsbt = psbt.data.inputs[i];
            console.log(`Input[${i}] witness count: ${inputWitness.length}`);
            console.log(`Input[${i}] witness (hex):`, inputWitness.map(w => Buffer.from(w).toString('hex')));

            if (inputPsbt) {
              if (inputPsbt.tapLeafScript && inputPsbt.tapLeafScript.length > 0) {
                const leaf = inputPsbt.tapLeafScript[0];
                console.log(`Input[${i}] tapLeafScript leafVersion: ${leaf.leafVersion}`);
                console.log(`Input[${i}] tapLeafScript script (hex): ${Buffer.from(leaf.script || []).toString('hex')}`);
                console.log(`Input[${i}] tapLeafScript controlBlock (hex): ${Buffer.from(leaf.controlBlock || []).toString('hex')}`);
              }
              if (inputPsbt.tapScriptSig) {
                console.log(`Input[${i}] tapScriptSig present (length ${inputPsbt.tapScriptSig.length})`);
              }
              if (inputPsbt.tapKeySig) {
                console.log(`Input[${i}] tapKeySig present: ${Buffer.from(inputPsbt.tapKeySig).toString('hex')}`);
              }
            }

            // Basic validation: if we have a controlBlock in PSBT, ensure it appears in witness stack
            const psbtControl = inputPsbt?.tapLeafScript && inputPsbt.tapLeafScript.length > 0 ? inputPsbt.tapLeafScript[0].controlBlock : undefined;
            if (psbtControl) {
              const controlHex = Buffer.from(psbtControl).toString('hex');
              const found = inputWitness.some(w => Buffer.from(w).toString('hex') === controlHex);
              if (!found) {
                const msg = `Control block mismatch on input ${i}: controlBlock not found in witness stack`;
                console.error(msg);
                // Return error to caller instead of broadcasting invalid tx
                return res.status(500).json({ error: msg, details: { input: i, controlBlock: controlHex, witness: inputWitness.map(w=>Buffer.from(w).toString('hex')) } });
              }
            }
          }
        } catch (dbgErr) {
          console.error('Error during witness debug inspection:', dbgErr);
        }

      // Broadcast transaction to Bitcoin network
      const broadcastResp = await fetch("https://mempool.space/testnet/api/tx", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: txHex,
      });

      if (!broadcastResp.ok) {
        const errorText = await broadcastResp.text();
        // Include txHex and per-input witness hex for debugging
        const witnesses = tx.ins.map((inp) => (inp.witness || []).map(w => Buffer.from(w).toString('hex')));
        return res.status(500).json({ error: 'Failed to broadcast transaction', rpc: errorText, txHex, witnesses });
      }

      const broadcastedTxid = await broadcastResp.text();
      const txLink = `https://mempool.space/testnet/tx/${broadcastedTxid}`;
      
      console.log(`Transaction broadcast: ${txLink}`);
      
      // Set settlement lock immediately after broadcast
      await storage.updateWallet(walletId, { 
        settlementInProgress: "true",
        pendingSettlementTxid: broadcastedTxid 
      });
      
      console.log('Waiting for 1 confirmation...');

      // Wait for 1 confirmation
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 60; // Wait up to 10 minutes (60 * 10s)
      let settlementConfirmedAt: Date | undefined;
      
      while (!confirmed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        const status = await getBitcoinTxStatus(broadcastedTxid);
        if (status.confirmed && status.confirmations >= 1) {
          confirmed = true;
          
          // Fetch settlement transaction to get blockchain confirmation time
          try {
            const txResp = await fetch(`https://mempool.space/testnet/api/tx/${broadcastedTxid}`);
            if (txResp.ok) {
              const txData = await txResp.json();
              if (txData.status?.block_time) {
                settlementConfirmedAt = new Date(txData.status.block_time * 1000);
              }
            }
          } catch (error) {
            console.error("Error fetching settlement tx time:", error);
          }
          
          console.log(`Transaction confirmed in block ${status.blockHeight}`);
        } else {
          attempts++;
          console.log(`Waiting for confirmation... (attempt ${attempts}/${maxAttempts})`);
        }
      }

      if (!confirmed) {
        // Update commitments but don't reset balance yet
        const allCommitments = await storage.getL2CommitmentsByWalletId(walletId);
        for (const commitment of allCommitments) {
          if (commitment.settled === "false") {
            await storage.updateL2Commitment(commitment.id, {
              settled: "true",
              settlementTxid: broadcastedTxid,
            });
          }
        }
        
        return res.json({
          success: true,
          txid: broadcastedTxid,
          txLink,
          message: "Transaction broadcast but not yet confirmed. L2 balance not reset.",
          confirmed: false,
          txHex,
        });
      }

      // Update all unsettled commitments for this wallet as settled
      const allCommitments = await storage.getL2CommitmentsByWalletId(walletId);
      for (const commitment of allCommitments) {
        if (commitment.settled === "false") {
          await storage.updateL2Commitment(commitment.id, {
            settled: "true",
            settlementTxid: broadcastedTxid,
            settlementConfirmedAt,
          });
        }
      }

      // Mark all deposits confirmed before settlement as consumed
      if (settlementConfirmedAt) {
        const allTransactions = await storage.getTransactionsByWalletId(walletId);
        for (const tx of allTransactions) {
          if (tx.status === "confirmed" && tx.confirmedAt) {
            const txConfirmedAt = new Date(tx.confirmedAt);
            // If deposit was confirmed before or at settlement time, mark as consumed
            if (txConfirmedAt <= settlementConfirmedAt) {
              await storage.updateTransaction(tx.id, { consumed: "true" });
            }
          }
        }
      }

      // Reset wallet L2 balance to 0 and clear settlement lock
      await storage.updateWallet(walletId, { 
        l2Balance: "0",
        settlementInProgress: "false",
        pendingSettlementTxid: null 
      });

      res.json({
        success: true,
        txid: broadcastedTxid,
        txLink,
        message: "Successfully settled to L1 and confirmed",
        confirmed: true,
        txHex,
      });
    } catch (error) {
      console.error("Settlement error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to settle to L1";
      
      // Clear settlement lock on error
      try {
        const { walletId } = req.body;
        if (walletId) {
          await storage.updateWallet(walletId, { 
            settlementInProgress: "false",
            pendingSettlementTxid: null 
          });
        }
      } catch (clearError) {
        console.error("Error clearing settlement lock:", clearError);
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Check and sync settlement confirmation status
  app.post("/api/sync-settlement/:walletId", async (req, res) => {
    try {
      const { walletId } = req.params;
      
      const wallet = await storage.getWallet(walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Get all settled commitments for this wallet
      const allCommitments = await storage.getL2CommitmentsByWalletId(walletId);
      const settledCommitments = allCommitments.filter(c => c.settled === "true" && c.settlementTxid);

      if (settledCommitments.length === 0) {
        return res.status(400).json({ error: "No settled commitments found" });
      }

      // Check the latest settlement transaction
      const latestCommitment = settledCommitments[settledCommitments.length - 1];
      const txid = latestCommitment.settlementTxid!;

      try {
        const status = await getBitcoinTxStatus(txid);
        
        if (status.confirmed && status.confirmations >= 1) {
          // Transaction is confirmed, reset L2 balance to 0
          await storage.updateWallet(walletId, { l2Balance: "0" });
          
          return res.json({
            success: true,
            message: "Settlement confirmed and L2 balance reset to 0",
            txid,
            confirmed: true,
            confirmations: status.confirmations,
            blockHeight: status.blockHeight,
          });
        } else {
          return res.json({
            success: true,
            message: "Settlement transaction found but not yet confirmed",
            txid,
            confirmed: false,
            confirmations: status.confirmations || 0,
          });
        }
      } catch (error) {
        console.error("Error checking tx status:", error);
        return res.status(500).json({ 
          error: "Failed to check transaction status",
          txid,
        });
      }
    } catch (error) {
      console.error("Sync settlement error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sync settlement";
      res.status(500).json({ error: errorMessage });
    }
  });

  return httpServer;
}
