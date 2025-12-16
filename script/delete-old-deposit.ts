import { db } from "../server/db";
import { transactions } from "../shared/schema";
import { eq } from "drizzle-orm";

async function deleteOldDeposit() {
  const txid = "89d899ed098b8d4017df13d1c4c1a5ffacba20176c724df5daa3d099468adeff";
  
  console.log(`Deleting deposit transaction ${txid}...`);
  
  const result = await db
    .delete(transactions)
    .where(eq(transactions.txid, txid))
    .returning();
  
  console.log("Deleted transaction:", result[0]);
  process.exit(0);
}

deleteOldDeposit().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
