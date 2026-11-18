import { ethers } from 'ethers';

const BUILDER_CODE = 'bc_sp3c85ix';
const ERC_8021_MARKER = '80218021802180218021802180218021';
const SCHEMA_ID = '00';

function buildDataSuffix(code) {
  const bytes = ethers.toUtf8Bytes(code);
  if (bytes.length === 0 || bytes.length > 255) {
    throw new Error('Invalid builder code length');
  }
  const len = bytes.length.toString(16).padStart(2, '0');
  return `${ethers.hexlify(bytes).slice(2)}${len}${SCHEMA_ID}${ERC_8021_MARKER}`;
}

const DATA_SUFFIX = buildDataSuffix(BUILDER_CODE);

function appendBuilderCode(calldata) {
  const hex = ethers.hexlify(calldata);
  return hex.endsWith(DATA_SUFFIX) ? hex : `${hex}${DATA_SUFFIX}`;
}

/**
 * Drop-in replacement for txData.safe.execTransaction(...).
 * Returns the same TransactionResponse, so `await tx.wait()` still works.
 */
async function sendSafeTxWithBuilderCode(txData) {
  const { safe, params } = txData;
  const calldata = safe.interface.encodeFunctionData('execTransaction', [
    params.to,
    params.value,
    params.data,
    params.op,
    params.safeTxGas,
    params.baseGas,
    params.gasPrice,
    params.gasToken,
    params.refundReceiver,
    params.sig,
  ]);
  const to = await safe.getAddress();
  return safe.runner.sendTransaction({ to, data: appendBuilderCode(calldata) });
}

export { BUILDER_CODE, DATA_SUFFIX, appendBuilderCode, sendSafeTxWithBuilderCode };
