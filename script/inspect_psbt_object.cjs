const bitcoin = require('bitcoinjs-lib');
const tinysecp256k1 = require('tiny-secp256k1');

bitcoin.initEccLib(tinysecp256k1);

const hex = process.argv[2];
if (!hex) {
  console.error('Usage: node inspect_psbt_object.cjs <psbt_hex>');
  process.exit(1);
}

const network = bitcoin.networks.testnet;
const psbt = bitcoin.Psbt.fromHex(hex, { network });

console.log('PSBT Object Structure Inspection');
console.log('=================================\n');

for (let i = 0; i < psbt.data.inputs.length; i++) {
  const inp = psbt.data.inputs[i];
  console.log(`Input ${i}:`);
  console.log('  All keys:', Object.keys(inp));
  console.log('  tapScriptSig:', inp.tapScriptSig);
  console.log('  tapKeySig:', inp.tapKeySig);
  console.log('  unknownKeyVals:', inp.unknownKeyVals);
  console.log('  Raw data keys:', Object.keys(psbt.data.inputs[i]));
  console.log();
}
