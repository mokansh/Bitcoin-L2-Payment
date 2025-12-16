import { db } from "../server/db";
import { wallets, l2Commitments, transactions } from "@shared/schema";
import { eq } from "drizzle-orm";

async function fixSettlementStatus() {
  const userAddress = "mth2J1yfgC84k8G2AqHKjdMRT3x14TsBwn";
  const settlementTxid = "7877bb61ca207ee4db78d95a57690f9462c17d11485c719d54e1d037fe4b1ef0";

  console.log("Fixing settlement status for user:", userAddress);
  console.log("Settlement txid:", settlementTxid);

  // Get wallet by bitcoin address
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.bitcoinAddress, userAddress));

  if (!wallet) {
    console.error("Wallet not found for address:", userAddress);
    return;
  }

  console.log("Found wallet:", wallet.id);
  console.log("Current L2 balance:", wallet.l2Balance);
  console.log("Settlement in progress:", wallet.settlementInProgress);
  console.log("Pending settlement txid:", wallet.pendingSettlementTxid);

  // Transaction is already confirmed (verified externally)
  // Block time: 1765876626 (from mempool.space API)
  const settlementConfirmedAt = new Date(1765876626 * 1000);
  console.log("Settlement confirmed at:", settlementConfirmedAt);

  // Update all unsettled commitments for this wallet
  const allCommitments = await db
    .select()
    .from(l2Commitments)
    .where(eq(l2Commitments.walletId, wallet.id));

  console.log(`\nFound ${allCommitments.length} total commitments`);

  const unsettledCommitments = allCommitments.filter(c => c.settled === "false");
  console.log(`Updating ${unsettledCommitments.length} unsettled commitments`);

  for (const commitment of unsettledCommitments) {
    await db
      .update(l2Commitments)
      .set({
        settled: "true",
        settlementTxid: settlementTxid,
        settlementConfirmedAt: settlementConfirmedAt,
      })
      .where(eq(l2Commitments.id, commitment.id));
    console.log(`Updated commitment ${commitment.id}`);
  }

  // Also update already settled commitments with wrong timestamp
  const settledCommitmentsWithWrongTimestamp = allCommitments.filter(
    c => c.settled === "true" && c.settlementTxid === settlementTxid &&
    (!c.settlementConfirmedAt || new Date(c.settlementConfirmedAt).getFullYear() === 1970)
  );
  
  if (settledCommitmentsWithWrongTimestamp.length > 0) {
    console.log(`Fixing ${settledCommitmentsWithWrongTimestamp.length} commitments with wrong timestamp`);
    for (const commitment of settledCommitmentsWithWrongTimestamp) {
      await db
        .update(l2Commitments)
        .set({
          settlementConfirmedAt: settlementConfirmedAt,
        })
        .where(eq(l2Commitments.id, commitment.id));
      console.log(`Fixed timestamp for commitment ${commitment.id}`);
    }
  }

  // Mark deposits as consumed if confirmed before settlement
  const allTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id));

  console.log(`\nChecking ${allTransactions.length} transactions for consumed status`);

  for (const tx of allTransactions) {
    if (tx.status === "confirmed" && tx.confirmedAt) {
      const txConfirmedAt = new Date(tx.confirmedAt);
      if (txConfirmedAt <= settlementConfirmedAt && tx.consumed !== "true") {
        await db
          .update(transactions)
          .set({ consumed: "true" })
          .where(eq(transactions.id, tx.id));
        console.log(`Marked transaction ${tx.id} as consumed`);
      }
    }
  }

  // Reset wallet L2 balance to 0 and clear settlement lock
  await db
    .update(wallets)
    .set({
      l2Balance: "0",
      settlementInProgress: "false",
      pendingSettlementTxid: null,
    })
    .where(eq(wallets.id, wallet.id));

  console.log("\n✅ Wallet updated successfully:");
  console.log("- L2 balance reset to 0");
  console.log("- Settlement in progress: false");
  console.log("- Pending settlement txid: null");
  console.log(`- ${unsettledCommitments.length} commitments marked as settled`);
}

fixSettlementStatus()
  .then(() => {
    console.log("\n✅ Settlement status fixed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error fixing settlement status:", error);
    process.exit(1);
  });
