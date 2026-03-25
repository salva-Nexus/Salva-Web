// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { GelatoRelayPack } = require('@safe-global/relay-kit');
const SafeClient = require('@safe-global/protocol-kit').default;
const { ethers } = require('ethers');

const sponsorKey = process.env.GELATO_RELAY_API_KEY;

async function initKits(safeAddress, ownerKey) {
    const protocolKit = await SafeClient.init({
        provider: process.env.BASE_SEPOLIA_RPC_URL,
        signer: ownerKey,
        safeAddress: safeAddress
    });
    const relayKit = new GelatoRelayPack({ apiKey: sponsorKey, protocolKit });
    return { protocolKit, relayKit };
}

/**
 * Sponsors any arbitrary contract call through the user's Safe.
 * This is used for all multisig admin operations (propose, validate, cancel, execute).
 * The Safe is the msg.sender on-chain — which is the address registered as validator.
 *
 * @param {string} safeAddress  - The validator's Safe address (registered in multisig)
 * @param {string} ownerKey     - The Safe owner's private key (decrypted via PIN)
 * @param {string} toContract   - The contract address to call (MULTISIG_CONTRACT_ADDRESS)
 * @param {string} calldata     - ABI-encoded calldata for the function call
 * @returns {Promise<{taskId: string}>}
 */
async function sponsorSafeMultisigCall(safeAddress, ownerKey, toContract, calldata) {
    const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);

    const transactions = [
        { to: toContract, data: calldata, value: '0' }
    ];

    const safeTransaction = await relayKit.createTransaction({
        transactions,
        options: { isSponsored: true }
    });
    const signedSafeTransaction = await protocolKit.signTransaction(safeTransaction);

    const result = await relayKit.executeTransaction({
        executable: signedSafeTransaction,
        options: { isSponsored: true }
    });

    console.log(`✅ Multisig call TaskId: ${result.taskId}`);
    return result;
}

/**
 * Sponsors a transfer() call.
 * recipient must already be a resolved wallet address (0x...).
 * If feeAmount > 0, a second transfer to treasury is bundled in the same tx.
 */
async function sponsorSafeTransfer(safeAddress, ownerKey, recipientAddress, amountWei, feeWei = 0n) {
    const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);

    const iface = new ethers.Interface([
        "function transfer(address,uint256)"
    ]);

    const mainCalldata = iface.encodeFunctionData("transfer", [recipientAddress, amountWei]);

    const transactions = [
        { to: process.env.NGN_TOKEN_ADDRESS, data: mainCalldata, value: '0' }
    ];

    if (feeWei > 0n) {
        const feeCalldata = iface.encodeFunctionData("transfer", [
            process.env.TREASURY_CONTRACT_ADDRESS,
            feeWei
        ]);
        transactions.push({ to: process.env.NGN_TOKEN_ADDRESS, data: feeCalldata, value: '0' });
    }

    const safeTransaction = await relayKit.createTransaction({ transactions, options: { isSponsored: true } });
    const signedSafeTransaction = await protocolKit.signTransaction(safeTransaction);

    const result = await relayKit.executeTransaction({
        executable: signedSafeTransaction,
        options: { isSponsored: true }
    });

    console.log(`✅ Transfer TaskId: ${result.taskId}`);
    return result;
}

/**
 * Sponsors an approve() call.
 * spenderAddress must already be a resolved wallet address (0x...).
 * No fee is charged on approvals.
 */
async function sponsorSafeApprove(safeAddress, ownerKey, spenderAddress, amountWei) {
    const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);

    const iface = new ethers.Interface([
        "function approve(address,uint256)"
    ]);

    const calldata = iface.encodeFunctionData("approve", [spenderAddress, amountWei]);

    const transactions = [{ to: process.env.NGN_TOKEN_ADDRESS, data: calldata, value: '0' }];
    const safeTransaction = await relayKit.createTransaction({ transactions, options: { isSponsored: true } });
    const signedSafeTransaction = await protocolKit.signTransaction(safeTransaction);

    const result = await relayKit.executeTransaction({
        executable: signedSafeTransaction,
        options: { isSponsored: true }
    });

    console.log(`✅ Approve TaskId: ${result.taskId}`);
    return result;
}

/**
 * Sponsors a transferFrom() call.
 * fromAddress and toAddress must already be resolved wallet addresses (0x...).
 * If feeWei > 0, a second transferFrom to treasury is bundled in the same tx..
 * trigger push
 */
async function sponsorSafeTransferFrom(ownerKey, safeAddress, fromAddress, toAddress, amountWei, feeWei = 0n) {
    const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);

    const iface = new ethers.Interface([
        "function transferFrom(address,address,uint256)"
    ]);

    const mainCalldata = iface.encodeFunctionData("transferFrom", [fromAddress, toAddress, amountWei]);

    const transactions = [
        { to: process.env.NGN_TOKEN_ADDRESS, data: mainCalldata, value: '0' }
    ];

    if (feeWei > 0n) {
        const feeCalldata = iface.encodeFunctionData("transferFrom", [
            fromAddress,
            process.env.TREASURY_CONTRACT_ADDRESS,
            feeWei
        ]);
        transactions.push({ to: process.env.NGN_TOKEN_ADDRESS, data: feeCalldata, value: '0' });
    }

    const safeTransaction = await relayKit.createTransaction({
        transactions,
        options: { isSponsored: true }
    });
    const signedSafeTransaction = await protocolKit.signTransaction(safeTransaction);

    const result = await relayKit.executeTransaction({
        executable: signedSafeTransaction,
        options: { isSponsored: true }
    });

    console.log(`✅ TransferFrom TaskId: ${result.taskId}`);
    return result;
}

module.exports = {
    sponsorSafeTransfer,
    sponsorSafeApprove,
    sponsorSafeTransferFrom,
    sponsorSafeMultisigCall,
};