import { db } from "../server/db";
import { transactions } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fixConfirmedAt() {
  const txid = "2317bf5c34d38fd3518e4d1d1925f0c8fd0661603fad6dd00492eacda3b4cdb8";
  const blockTime = 1765798951; // from mempool.space
  const confirmedAt = new Date(blockTime * 1000);
  
  console.log(`Updating transaction ${txid}`);
  console.log(`Setting confirmedAt to: ${confirmedAt.toISOString()}`);
  
  const [tx] = await db.select().from(transactions).where(eq(transactions.txid, txid));
  
  if (!tx) {
    console.error("Transaction not found");
    process.exit(1);
  }
  
  console.log(`Current confirmedAt: ${tx.confirmedAt}`);
  
  const [updated] = await db
    .update(transactions)
    .set({ confirmedAt })
    .where(eq(transactions.txid, txid))
    .returning();
  
  console.log(`Updated confirmedAt to: ${updated.confirmedAt}`);
  console.log("Done!");
  process.exit(0);
}

fixConfirmedAt();
