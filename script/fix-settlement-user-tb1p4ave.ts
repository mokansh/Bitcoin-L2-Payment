import { db } from "../server/db";
import { wallets, l2Commitments, transactions } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fixSettlement() {

  const userAddress = "tb1p2wqa6r39umlfmpj380mejlrfnwadd2k2vypunh3rtf7ca26lqmlqvz6j3u";
  const settlementTxid = "a9f9f4829d2415e397f14f47a4a1123fce40060e7b8f00cddf3f108b2864bbf7";
  const blockTime = 1765955432; // 2025-12-17T07:10:32.000Z
  const settlementConfirmedAt = new Date(blockTime * 1000);

  console.log("Fixing settlement for user:", userAddress);
  console.log("Settlement txid:", settlementTxid);
  console.log("Settlement confirmed at:", settlementConfirmedAt);

  // Get wallet
  const wallet = await db
    .select()
    .from(wallets)
    .where(eq(wallets.bitcoinAddress, userAddress))
    .limit(1);

  if (wallet.length === 0) {
    console.error("Wallet not found");
    process.exit(1);
  }

  const walletId = wallet[0].id;
  console.log("Wallet ID:", walletId);
  console.log("Current L2 Balance:", wallet[0].l2Balance);

  // Get all commitments for this wallet
  const allCommitments = await db
    .select()
    .from(l2Commitments)
    .where(eq(l2Commitments.walletId, walletId));

  console.log("\nTotal commitments:", allCommitments.length);

  // Mark all unsettled commitments as settled with the settlement txid
  const unsettledCommitments = allCommitments.filter(c => c.settled === "false");
  console.log("Unsettled commitments:", unsettledCommitments.length);

  for (const commitment of unsettledCommitments) {
    console.log(`Marking commitment ${commitment.id} as settled...`);
    await db
      .update(l2Commitments)
      .set({
        settled: "true",
        settlementTxid,
        settlementConfirmedAt,
      })
      .where(eq(l2Commitments.id, commitment.id));
  }

  // Get all transactions for this wallet
  const allTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, walletId));

  console.log("\nTotal transactions:", allTransactions.length);

  // Mark all confirmed transactions that were confirmed before or at settlement time as consumed
  let consumedCount = 0;
  for (const tx of allTransactions) {
    if (tx.status === "confirmed" && tx.confirmedAt) {
      const txConfirmedAt = new Date(tx.confirmedAt);
      if (txConfirmedAt <= settlementConfirmedAt && tx.consumed === "false") {
        console.log(`Marking transaction ${tx.txid} as consumed (confirmed at ${txConfirmedAt})`);
        await db
          .update(transactions)
          .set({ consumed: "true" })
          .where(eq(transactions.id, tx.id));
        consumedCount++;
      }
    }
  }

  console.log(`\nMarked ${consumedCount} transactions as consumed`);

  // Reset wallet L2 balance to 0
  console.log("\nResetting L2 balance to 0...");
  await db
    .update(wallets)
    .set({
      l2Balance: "0",
      settlementInProgress: "false",
      pendingSettlementTxid: null,
    })
    .where(eq(wallets.id, walletId));

  console.log("✓ Settlement fix complete!");
  console.log(`\nSummary:`);
  console.log(`- Marked ${unsettledCommitments.length} commitments as settled`);
  console.log(`- Settlement txid: ${settlementTxid}`);
  console.log(`- Settlement confirmed at: ${settlementConfirmedAt}`);
  console.log(`- Marked ${consumedCount} transactions as consumed`);
  console.log(`- Reset L2 balance to 0`);

  process.exit(0);
}

fixSettlement().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
