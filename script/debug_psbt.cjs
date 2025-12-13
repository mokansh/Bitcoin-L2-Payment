const bitcoin = require('bitcoinjs-lib');
const tinysecp256k1 = require('tiny-secp256k1');

bitcoin.initEccLib(tinysecp256k1);

const hex = process.argv[2] || `70736274ff0100df0200000001f33869e9c906aa9aa9d513a959c071c9f194c75eae588eecc063942f808283680000000000ffffffff04c4090000000000002251200532274d70e710a9ee2f686509a93c55b7c97e3ce86b05d9eaf17e52e3c94ea5d007000000000000225120f881b29e69dfb63e3f4e98d1ea0eed268faedce82bd2afc5e96054072f7c6ecce8030000000000002251208db0ba3d8734f840ed7a46801287118571267f0e4579a4002f2c15c9027a208f6810000000000000225120729042852cc0f94535bde5442d36317c4a453bc4283ed448084a012149038166000000000001012b102700000000000022512060ac03e65a8f8fc0115b9bf41f18cff48344b838bfecc50c0edfc64bd0de7fe64215c1d58ce235d66ccb0e0e1a7ba666d1f354d53f8dabceadfadd51bc8e0cdc8b14f6875b026b275fa827dbf2ca49c0c05d6974a5498990d0c4a040140e2333b8a71f4520d6ff3e65580cfa63f8a4a3afe79b090dd6b8532b1674d6637251bb306a76743fad2021953defaf4075159ea9fffda17829e518b8d1967c912a3fd3a402422f8ceb51acc00000000000`;

const network = bitcoin.networks.testnet;

const psbt = bitcoin.Psbt.fromHex(hex, { network });

console.log('Inputs:', psbt.txInputs.length);
for (let i = 0; i < psbt.data.inputs.length; i++) {
  const inp = psbt.data.inputs[i];
  console.log(`\n--- Input ${i} ---`);
  if (inp.witnessUtxo) {
    console.log('witnessUtxo value:', inp.witnessUtxo.value.toString());
    console.log('witnessUtxo script hex:', Buffer.from(inp.witnessUtxo.script).toString('hex'));
  }
  if (inp.tapLeafScript) {
    for (const [j, leaf] of inp.tapLeafScript.entries()) {
      console.log(`tapLeafScript[${j}] leafVersion:`, leaf.leafVersion);
      console.log(`tapLeafScript[${j}] script:`, leaf.script.toString('hex'));
      console.log(`tapLeafScript[${j}] controlBlock:`, leaf.controlBlock.toString('hex'));
      console.log(`tapLeafScript[${j}] script len:`, leaf.script.length);
      console.log(`tapLeafScript[${j}] control len:`, leaf.controlBlock.length);
    }
  }
  if (inp.tapScriptSig) {
    console.log('tapScriptSig present, entries:', inp.tapScriptSig.length);
    for (const [k, s] of inp.tapScriptSig.entries()) {
      if (Buffer.isBuffer(s)) {
        console.log(`tapScriptSig[${k}] len:`, s.length, s.toString('hex'));
      } else if (s && s.signature) {
        console.log(`tapScriptSig[${k}] object sig len:`, s.signature.length, s.signature.toString('hex'));
      } else {
        console.log(`tapScriptSig[${k}] (other):`, s);
      }
    }
  } else {
    console.log('tapScriptSig: none');
  }
  if (inp.tapKeySig) {
    console.log('tapKeySig present len:', inp.tapKeySig.length, inp.tapKeySig.toString('hex'));
  } else {
    console.log('tapKeySig: none');
  }
}

console.log('\nOutputs:');
for (const o of psbt.txOutputs) {
  console.log('output script:', Buffer.from(o.script).toString('hex'), 'value:', o.value.toString());
}

// Try to show userSignedPsbt vs unsigned signatures
try {
  console.log('\nAttempting to validate signatures of inputs...');
  const valid = psbt.validateSignaturesOfAllInputs();
  console.log('validateSignaturesOfAllInputs:', valid);
} catch (e) {
  console.error('validateSignaturesOfAllInputs error:', e.message);
}

console.log('\nPSBT hex length:', hex.length);
