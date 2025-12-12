import { db } from "./db";
import { transactions } from "../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Script to update existing transaction timestamps by fetching from mempool.space API
 */
async function updateTransactionTimestamps() {
  try {
    console.log("Fetching all transactions...");
    const allTransactions = await db.select().from(transactions);
    
    console.log(`Found ${allTransactions.length} transactions to update`);
    
    const base = "https://mempool.space/testnet/api";
    
    for (const tx of allTransactions) {
      try {
        // Fetch transaction details from mempool API
        const response = await fetch(`${base}/tx/${tx.txid}`);
        
        if (!response.ok) {
          console.error(`Failed to fetch tx ${tx.txid}: ${response.status}`);
          continue;
        }
        
        const txData = await response.json();
        
        // Extract timestamp from block_time
        let txTimestamp: Date;
        if (txData.status?.block_time) {
          txTimestamp = new Date(txData.status.block_time * 1000);
        } else {
          // If no block_time (pending tx), use current time
          txTimestamp = new Date();
        }
        
        // Update the transaction
        await db.update(transactions)
          .set({ createdAt: txTimestamp })
          .where(eq(transactions.id, tx.id));
        
        console.log(`Updated ${tx.txid}: ${txTimestamp.toISOString()}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error updating tx ${tx.txid}:`, error);
      }
    }
    
    console.log("Timestamp update complete!");
    process.exit(0);
    
  } catch (error) {
    console.error("Error in update script:", error);
    process.exit(1);
  }
}

updateTransactionTimestamps();
