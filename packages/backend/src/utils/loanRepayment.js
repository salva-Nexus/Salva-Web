// packages/backend/src/utils/loanRepayment.js
// ─────────────────────────────────────────────────────────────────────────────
// Deployment loan repayment helper.
// Called silently before any MultiSend transaction.
// If the user owes a deployment loan AND has enough balance to cover it
// alongside their current tx, injects an extra ERC20.transfer leg into
// the MultiSend calls array. Never blocks the user's intended transaction.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ethers } = require('ethers');

const ERC20_TRANSFER_IFACE = new ethers.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const ERC20_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

function cleanAddr(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(0x[0-9a-fA-F]{40})/);
  return m ? m[1].toLowerCase() : null;
}

// Returns the treasury address for the given chain
function getTreasury(chain) {
  const isProd = process.env.NODE_ENV === 'production';
  if (chain === 'bnb') {
    return cleanAddr(
      isProd
        ? process.env.L1_TREASURY_CONTRACT_ADDRESS
        : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS
    );
  }
  return cleanAddr(process.env.TREASURY_CONTRACT_ADDRESS);
}

// Resolves token addresses in priority order: NGNs → cNGN → USDT → USDC
function getTokenCandidates(chain) {
  const isProd = process.env.NODE_ENV === 'production';
  if (chain === 'bnb') {
    return [
      {
        symbol: 'NGNs',
        address: cleanAddr(
          isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
        ),
        isNgn: true,
      },
      {
        symbol: 'cNGN',
        address: cleanAddr(
          isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
        ),
        isNgn: true,
      },
      {
        symbol: 'USDT',
        address: cleanAddr(
          isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
        ),
        isNgn: false,
      },
      {
        symbol: 'USDC',
        address: cleanAddr(
          isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
        ),
        isNgn: false,
      },
    ];
  }
  return [
    { symbol: 'NGNs', address: cleanAddr(process.env.NGN_TOKEN_ADDRESS), isNgn: true },
    { symbol: 'cNGN', address: cleanAddr(process.env.CNGN_CONTRACT_ADDRESS), isNgn: true },
    { symbol: 'USDT', address: cleanAddr(process.env.USDT_CONTRACT_ADDRESS), isNgn: false },
    { symbol: 'USDC', address: cleanAddr(process.env.USDC_CONTRACT_ADDRESS), isNgn: false },
  ];
}

/**
 * checkAndBuildLoanRepayment
 *
 * @param {string}  chain          - 'base' | 'bnb'
 * @param {string}  safeAddress    - user's Safe wallet address
 * @param {object}  userDoc        - Mongoose User or UserBNB document (live, not lean)
 * @param {object}  rpcProvider    - ethers JsonRpcProvider for this chain
 *
 * @returns {{ repayCalldata: {to, data}|null, markPaid: function }}
 *   repayCalldata — an extra { to, data } call to add to MultiSend, or null
 *   markPaid      — async function to call after TX confirms to update the DB
 */
async function checkAndBuildLoanRepayment(chain, safeAddress, userDoc, rpcProvider) {
  // Nothing owed or already paid
  if (
    !userDoc ||
    userDoc.hasPaidDeploymentLoan ||
    (!userDoc.deploymentLoanNGN && !userDoc.deploymentLoanUSD)
  ) {
    return { repayCalldata: null, markPaid: async () => {} };
  }

  const treasury = getTreasury(chain);
  if (!treasury) {
    console.warn(`⚠️ [loanRepayment] Treasury not configured for chain=${chain} — skipping`);
    return { repayCalldata: null, markPaid: async () => {} };
  }

  const candidates = getTokenCandidates(chain);

  for (const c of candidates) {
    if (!c.address) continue;

    try {
      // Determine loan amount in this token's unit
      const loanAmount = c.isNgn ? userDoc.deploymentLoanNGN : userDoc.deploymentLoanUSD;
      if (!loanAmount || loanAmount <= 0) continue;

      // Fetch decimals
      let decimals = 6;
      if (chain === 'bnb') {
        try {
          const { getL1TokenDecimals } = require('./l1Decimals');
          decimals = await getL1TokenDecimals(ethers.getAddress(c.address));
        } catch {
          decimals = c.isNgn ? 6 : 18; // NGNs/cNGN=6, USDT/USDC=18 on BNB
        }
      }

      const loanWei = ethers.parseUnits(loanAmount.toFixed(decimals), decimals);

      // Check user balance
      const contract = new ethers.Contract(
        ethers.getAddress(c.address),
        ERC20_BAL_ABI,
        rpcProvider
      );
      const balWei = await contract.balanceOf(ethers.getAddress(safeAddress));

      // Must have strictly more than the loan amount so the user's actual tx isn't starved
      if (balWei <= loanWei) {
        console.log(
          `⏭️ [loanRepayment] ${c.symbol} balance (${ethers.formatUnits(balWei, decimals)}) ` +
            `<= loan (${loanAmount}) — skipping repayment this TX`
        );
        continue;
      }

      // User has enough — build the repayment calldata
      const repayData = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
        ethers.getAddress(treasury),
        loanWei,
      ]);

      console.log(
        `💳 [loanRepayment] Repaying deployment loan: ${loanAmount} ${c.symbol} → treasury (chain=${chain})`
      );

      return {
        repayCalldata: { to: ethers.getAddress(c.address), data: repayData },
        markPaid: async () => {
          try {
            userDoc.hasPaidDeploymentLoan = true;
            await userDoc.save();
            console.log(`✅ [loanRepayment] Deployment loan marked paid for ${safeAddress}`);
          } catch (e) {
            console.error(`❌ [loanRepayment] Could not mark loan paid:`, e.message);
          }
        },
      };
    } catch (e) {
      console.warn(`⚠️ [loanRepayment] Error checking ${c.symbol}:`, e.message);
    }
  }

  // No token had enough balance above the loan — defer
  return { repayCalldata: null, markPaid: async () => {} };
}

module.exports = { checkAndBuildLoanRepayment };
