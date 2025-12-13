const bitcoin = require('bitcoinjs-lib');
const txHex = process.argv[2];
if (!txHex) { console.error('Usage: node inspect_tx.cjs <txHex>'); process.exit(1);} 
const tx = bitcoin.Transaction.fromHex(txHex);
console.log('vin:', tx.ins.length);
for (let i = 0; i < tx.ins.length; i++) {
  const wit = tx.ins[i].witness || [];
  console.log(`Input[${i}] witness count: ${wit.length}`);
  wit.forEach((w, idx) => console.log(`  [${idx}] len=${w.length} hex=${w.toString('hex')}`));
}
