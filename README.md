<div align="center">
  <h1>🛡️ Salva Nexus</h1>
  <p><b>On-Chain Payment Infrastructure for the Next Billion</b></p>
  
  <img src="https://img.shields.io/badge/Network-Base-blue?style=for-the-badge&logo=base" />
  <img src="https://img.shields.io/badge/Stack-Node.js_|_React-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Standard-ERC--4337-orange?style=for-the-badge" />
</div>

---

### ON-CHAIN PAYMENT INFRASTRUCTURE FOR THE NEXT BILLION

Salva Nexus is a premier on-chain financial protocol designed specifically for the Nigerian economy. By leveraging the **Base (Layer 2)** network and **ERC-4337 Account Abstraction**, Salva provides a frictionless, "gasless" experience for everyday Naira-referenced payments.

### ⚙️ BACKEND ENGINE (Node.js & Express)

The backend acts as the secure bridge between traditional user identifiers and the blockchain.
- **Identity Orchestration:** Manages the mapping of 10-digit account numbers to Safe Smart Wallets via the on-chain Registry.
- **Gasless Relay (Gelato):** Integrates with Gelato Relay to sponsor gas fees, allowing users to transact without needing to hold ETH for network fees.
- **Secure Authentication:** Handles OTP-based verification via SMTP to ensure only authorized users can trigger transactions through the backend relay.
- **Transaction Indexing:** Uses MongoDB Atlas to store and serve a readable history of all on-chain activity for the user's dashboard.

### 📱 FRONTEND DASHBOARD (React)

The "Transaction Vault" provides a mobile-first, banking-style interface for the Nigerian user.
- **Abstracted UX:** Users interact with a familiar 10-digit account number interface, while the frontend handles the complex logic of interacting with Safe Smart Wallets.
- **Real-Time Balances:** Connects directly to the NGNs contract to display live Naira-denominated balances with 6-decimal precision.
- **Social Recovery Flow:** Provides an interface for users to recover access to their funds using email-based authentication rather than traditional seed phrases.

### 📜 SMART CONTRACT CORE

**1. NGN Denominated Balances (NGNs.sol)**
The central asset of the ecosystem. It is an upgradeable (UUPS) ERC-20 token tailored for the Nigerian market. 
- **Account Aliasing:** Enables native transfers using 10-digit account numbers instead of complex hex addresses.
- **Compliance:** Includes built-in freezing/unfreezing mechanics for account security and administrative control.

**2. NGNs Registry (Registry.sol)**
The source of truth for identity. Links 10-digit account numbers to Safe Smart Wallet addresses.

**3. Salva Treasury (SalvaTreasury.sol)**
The decentralized vault managing protocol reserves and liquidity allocation via the MANAGER_ROLE.

### GETTING STARTED

**Prerequisites**
- Node.js & npm
- Foundry (for smart contracts)

**Contract Deployment**
```bash
# Clone the repository
git clone https://github.com/cboi019/SALVA-NEXUS

# Build contracts
forge install && forge build
cd packages/backend
npm install

# Configure .env with MongoDB and Gelato keys
node src/index.js
```

<div align="center"> <sub>Built for the Base Ecosystem • © 2026 Salva NEXUS LTD</sub> </div>
