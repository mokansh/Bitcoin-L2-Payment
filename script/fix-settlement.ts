import { db } from "../server/db";
import { wallets, l2Commitments, transactions } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fixSettlement() {
  const walletId = "6ae4102e-bbe4-4e8c-884c-69fc58fd8ed9";
  const settlementTxid = "debe1b01c06cd895076bbd8d19ffb15f3c5f1c5306ed38f403333e2e81dcfdbe";
  const commitmentId = "b74b0517-fcec-418d-a1de-adf3873cef86";
  
  console.log("Fixing settlement for commitment:", commitmentId);
  console.log("Settlement txid:", settlementTxid);
  
  // Settlement confirmed at block_time: 1 (testnet timestamp)
  const settlementConfirmedAt = new Date();
  
  console.log("\n1. Updating commitment as settled...");
  const commitmentResult = await db
    .update(l2Commitments)
    .set({ 
      settled: "true",
      settlementTxid: settlementTxid,
      settlementConfirmedAt: settlementConfirmedAt
    })
    .where(eq(l2Commitments.id, commitmentId))
    .returning();
  
  console.log(`   ✓ Updated commitment:`, commitmentResult[0]);
  
  console.log("\n2. Resetting wallet L2 balance to 0...");
  const walletResult = await db
    .update(wallets)
    .set({ 
      l2Balance: "0",
      settlementInProgress: "false",
      pendingSettlementTxid: null
    })
    .where(eq(wallets.id, walletId))
    .returning();
  
  console.log(`   ✓ Updated wallet balance:`, walletResult[0].l2Balance);
  
  console.log("\n3. Marking consumed deposits...");
  // Get all deposits for this wallet
  const allDeposits = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, walletId));
  
  console.log(`   Found ${allDeposits.length} deposits`);
  
  // Mark all confirmed deposits as consumed
  for (const deposit of allDeposits) {
    if (deposit.status === "confirmed" && deposit.consumed === "false") {
      await db
        .update(transactions)
        .set({ consumed: "true" })
        .where(eq(transactions.id, deposit.id));
      console.log(`   ✓ Marked deposit as consumed: ${deposit.txid} (${deposit.amount} BTC)`);
    }
  }
  
  console.log("\n✓ Settlement fixed successfully!");
  process.exit(0);
}

fixSettlement().catch((error) => {
  console.error("Error fixing settlement:", error);
  process.exit(1);
});
