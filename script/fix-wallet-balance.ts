import { db } from "../server/db";
import { wallets } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fixWalletBalance() {
  const walletAddress = "n2ARVKvPULBbyzGzz29vBos3nvRts3CSXt";
  
  console.log(`Updating wallet ${walletAddress} balance to 0...`);
  
  const result = await db
    .update(wallets)
    .set({ l2Balance: "0.00000000" })
    .where(eq(wallets.bitcoinAddress, walletAddress))
    .returning();
  
  console.log("Updated wallet:", result[0]);
  process.exit(0);
}

fixWalletBalance().catch((err) => {
  console.error("Error updating wallet:", err);
  process.exit(1);
});
