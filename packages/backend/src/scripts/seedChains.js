import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SupportedChain } from '../models/SupportedChain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const TRUST_WALLET_BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

const evmChainsToSeed = [
  // ================= MAINNETS (EVM ONLY) =================
  {
    chainName: 'base',
    chainId: 8453,
    logo: `${TRUST_WALLET_BASE}/base/info/logo.png`,
    isActive: true,
  },
  {
    chainName: 'bsc',
    chainId: 56,
    logo: `${TRUST_WALLET_BASE}/binance/info/logo.png`,
    isActive: true,
  },

  // ================= TESTNETS (EVM ONLY) =================
  {
    chainName: 'base',
    chainId: 84532,
    logo: `${TRUST_WALLET_BASE}/base/info/logo.png`,
    type: 'TESTNET',
    isActive: true,
  },
  {
    chainName: 'bsc',
    chainId: 97,
    logo: `${TRUST_WALLET_BASE}/binance/info/logo.png`,
    type: 'TESTNET',
    isActive: true,
  },

];

async function seedSupportedChains() {

    console.log('⏳ Seeding EVM-compatible SupportedChains...');

    const operations = evmChainsToSeed.map((chain) => ({
      updateOne: {
        filter: { chainId: chain.chainId }, // <--- Filter by chainId instead of chainName
        update: { $set: chain },
        upsert: true,
      },
    }));

    const result = await SupportedChain.bulkWrite(operations);

    console.log('✅ EVM Seeding Complete!');
    console.log(`   - Matched:  ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}`);
    console.log(`   - Upserted: ${result.upsertedCount}`);

    process.exit(0);
}

seedSupportedChains();
