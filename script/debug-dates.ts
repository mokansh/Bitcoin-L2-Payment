const depositCreatedAt = new Date("2025-12-15T10:45:54.056Z");
const settlementConfirmedAt = new Date(1765777859 * 1000); // 11:20:59 AM IST

console.log("Deposit createdAt:", depositCreatedAt.toISOString());
console.log("Settlement confirmed:", settlementConfirmedAt.toISOString());
console.log("Deposit < Settlement?", depositCreatedAt < settlementConfirmedAt);
console.log("Deposit > Settlement?", depositCreatedAt > settlementConfirmedAt);

console.log("\nTimestamp comparison:");
console.log("Deposit timestamp:", depositCreatedAt.getTime());
console.log("Settlement timestamp:", settlementConfirmedAt.getTime());
console.log("Difference (ms):", settlementConfirmedAt.getTime() - depositCreatedAt.getTime());
