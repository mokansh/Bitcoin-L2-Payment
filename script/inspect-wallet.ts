import { db } from "../server/db";
import { wallets, transactions, l2Commitments } from "../shared/schema";
import { eq } from "drizzle-orm";

async function inspectWallet() {
  const walletAddress = "n2ARVKvPULBbyzGzz29vBos3nvRts3CSXt";
  
  // Get wallet
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.bitcoinAddress, walletAddress));
  
  if (!wallet) {
    console.log("Wallet not found");
    return;
  }
  
  console.log("Wallet:", {
    id: wallet.id,
    address: wallet.bitcoinAddress,
    l2Balance: wallet.l2Balance,
  });
  
  // Get all transactions
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id));
  
  console.log("\nTransactions:");
  txs.forEach(tx => {
    console.log({
      txHash: tx.txHash,
      amount: tx.amount,
      status: tx.status,
      createdAt: tx.createdAt,
    });
  });
  
  // Get all commitments
  const commitments = await db
    .select()
    .from(l2Commitments)
    .where(eq(l2Commitments.walletId, wallet.id));
  
  console.log("\nCommitments:");
  commitments.forEach(c => {
    console.log({
      amount: c.amount,
      fee: c.fee,
      settled: c.settled,
      settlementTxid: c.settlementTxid,
      createdAt: c.createdAt,
    });
  });
  
  // Calculate what should be shown
  const confirmedTxs = txs.filter(tx => tx.status === "confirmed");
  const settledCommitments = commitments.filter(c => c.settled === "true");
  
  console.log("\n--- Calculation Logic ---");
  console.log("Settled commitments count:", settledCommitments.length);
  
  if (settledCommitments.length === 0) {
    const totalFunded = confirmedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const unsettledCommitments = commitments.filter(c => c.settled === "false");
    const totalCommitted = unsettledCommitments.reduce((sum, c) => {
      const amount = parseFloat(String(c.amount));
      const fee = parseFloat(String(c.fee || "0"));
      return sum + amount + fee;
    }, 0);
    console.log("Total funded:", totalFunded);
    console.log("Total committed:", totalCommitted);
    console.log("Calculated balance:", (totalFunded - totalCommitted).toFixed(8));
  } else {
    console.log("Settlement exists - should use DB value:", wallet.l2Balance);
  }
  
  process.exit(0);
}

inspectWallet().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
