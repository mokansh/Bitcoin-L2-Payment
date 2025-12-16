import { db } from "../server/db";
import { transactions, l2Commitments } from "../shared/schema";
import { eq, and, lte } from "drizzle-orm";

async function updateTimestamps() {
  const walletId = "6ae4102e-bbe4-4e8c-884c-69fc58fd8ed9";
  const settlementTxid = "bbedeed36c3006d7b05532a65af1c5bcfb05b9258f14f68536c4349c8c5699eb";
  
  console.log("1. Updating settlement confirmation time...");
  // Settlement confirmed at block_time: 1765777859 = 2025-12-15 05:50:59 UTC
  const settlementConfirmedAt = new Date(1765777859 * 1000);
  
  const result = await db
    .update(l2Commitments)
    .set({ settlementConfirmedAt })
    .where(
      and(
        eq(l2Commitments.walletId, walletId),
        eq(l2Commitments.settlementTxid, settlementTxid)
      )
    )
    .returning();
  
  console.log(`   ✓ Updated ${result.length} commitments with settlement time:`, settlementConfirmedAt.toISOString());
  
  console.log("\n2. Marking deposits confirmed before settlement as consumed...");
  const consumedResult = await db
    .update(transactions)
    .set({ consumed: "true" })
    .where(
      and(
        eq(transactions.walletId, walletId),
        lte(transactions.confirmedAt, settlementConfirmedAt)
      )
    )
    .returning();
  
  console.log(`   ✓ Marked ${consumedResult.length} deposits as consumed:`);
  consumedResult.forEach(tx => {
    console.log(`     - ${tx.txid.substring(0, 20)}... (${tx.amount} BTC, confirmed: ${tx.confirmedAt})`);
  });
  
  console.log("\n3. Verifying current state...");
  const allTxs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, walletId));
  
  console.log("\nAll transactions:");
  allTxs.forEach(tx => {
    console.log({
      txid: tx.txid.substring(0, 20) + "...",
      amount: tx.amount,
      confirmedAt: tx.confirmedAt,
      consumed: tx.consumed,
      status: tx.status,
    });
  });
  
  process.exit(0);
}

updateTimestamps().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
