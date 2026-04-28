<div align="center">

<br />

# Salva — Web Application

### The Frontend & Backend powering the Salva Payment Protocol

<br />

[![Network](https://img.shields.io/badge/Network-Base_Mainnet-0052FF?style=for-the-badge&logo=coinbase)](https://base.org)
[![Stack](https://img.shields.io/badge/Stack-React_%7C_Node.js_%7C_Express-363636?style=for-the-badge)](https://reactjs.org)
[![Safe](https://img.shields.io/badge/Wallets-Safe_Smart_Accounts-00C853?style=for-the-badge)](https://safe.global)
[![License](https://img.shields.io/badge/License-MIT-D4AF37?style=for-the-badge)](./LICENSE)
[![Live](https://img.shields.io/badge/Live-salva--nexus.org-D4AF37?style=for-the-badge)](https://salva-nexus.org)

<br />

> The Salva web app is the full-stack interface sitting on top of the [Salva Protocol](https://github.com/salva-Nexus/SALVA-V2). It lets users create gasless Safe smart wallets, register human-readable name aliases (e.g. `charles@salva`), send NGNs / USDT / USDC, and buy or sell NGNs — all without ever touching a seed phrase or paying gas.

<br />

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Package Structure](#package-structure)
- [Backend](#backend)
  - [Core Routes](#core-routes)
  - [Admin & MultiSig Relay](#admin--multisig-relay)
  - [Buy/Sell NGNs](#buysell-ngns)
  - [Relay Service](#relay-service)
  - [Security](#security)
- [Frontend](#frontend)
  - [Pages](#pages)
  - [Key Components](#key-components)
- [How Gasless Transactions Work](#how-gasless-transactions-work)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Deployment](#deployment)

---

## Overview

Salva is a payment protocol built on Base that makes crypto feel like a messaging app. This repo is the web layer — a React frontend and a Node/Express backend — that abstracts all on-chain complexity away from end users.

What this app does:

- **Registers Safe smart accounts** for new users at signup — no seed phrase, just email + PIN
- **Relays all transactions** through the backend wallet so users never pay gas
- **Resolves name aliases** like `charles@salva` to wallet addresses on-chain via the Salva Singleton
- **Signs name registration requests** with the backend ECDSA signer before the user's Safe executes them on-chain
- **Provides a validator admin panel** for on-chain MultiSig governance (registry proposals, validator set, contract upgrades, pause/unpause)
- **Manages NGNs issuance and redemption** through a treasury-operated chat interface — users request to buy or sell NGNs and the Salva treasury handles all minting and burning directly

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / App                        │
│                                                             │
│   Home.jsx          Dashboard.jsx        AdminPanel.jsx     │
│   (landing)         (wallet UI)          (multisig ops)     │
│                                                             │
│   SalvaNGNsChat.jsx              SalvaSellerChat.jsx        │
│   (user request widget)          (treasury mgmt inbox)      │
└──────────────────────────────┬──────────────────────────────┘
                               │  HTTPS
┌──────────────────────────────▼──────────────────────────────┐
│                    Express Backend (Node.js)                 │
│                                                             │
│  /api/*          — auth, balance, transfer, alias, stats    │
│  /api/admin/*    — multisig relay (validators only)         │
│  /api/buy-ngns/* — NGNs issuance & redemption               │
│                                                             │
│  relayService.js  — encodes + routes all Safe tx calls      │
│  walletSigner.js  — backend EOA wallet (gas payer)          │
└──────────────────────────────┬──────────────────────────────┘
                               │  ethers.js + Safe SDK
┌──────────────────────────────▼──────────────────────────────┐
│                     Base Mainnet (L2)                       │
│                                                             │
│  User Safe (GnosisSafeL2)  ──►  MultiSig (ERC1967Proxy)    │
│                                 Singleton (ERC1967Proxy)    │
│                                 RegistryFactory             │
│                                 BaseRegistry clones         │
│                                 NGNs ERC20 token            │
└─────────────────────────────────────────────────────────────┘
```

Every user action that touches the chain flows through the same pattern: the **backend wallet** pays gas by calling `execTransaction` on the user's **Safe**, which in turn calls the target protocol contract as `msg.sender`. The user only signs with their PIN — never with ETH in their pocket.

---

## Package Structure

```
packages/
├── backend/
│   ├── src/
│   │   ├── index.js               # Express app entry point
│   │   ├── routes/
│   │   │   ├── admin.js           # MultiSig governance routes
│   │   │   └── buyNgns.js         # NGNs issuance & redemption routes
│   │   ├── services/
│   │   │   ├── relayService.js    # Safe transaction relay
│   │   │   ├── walletSigner.js    # Backend EOA wallet
│   │   │   ├── userService.js     # Safe deployment on signup
│   │   │   ├── registryResolver.js # On-chain name resolution
│   │   │   └── emailService.js    # Resend email notifications
│   │   ├── models/                # Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Transaction.js
│   │   │   ├── TransactionQueue.js
│   │   │   ├── Proposal.js
│   │   │   ├── MintRequest.js
│   │   │   ├── WalletRegistry.js
│   │   │   ├── FeeConfig.js
│   │   │   └── ReservedNames.js
│   │   └── utils/
│   │       └── encryption.js      # PBKDF2 PIN-based key encryption
│   └── .env
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.jsx            # Landing page
        │   ├── Dashboard.jsx       # Main wallet UI
        │   ├── AdminPanel.jsx      # Validator governance panel
        │   ├── Login.jsx
        │   └── Transactions.jsx
        ├── components/
        │   ├── SalvaNGNsChat.jsx   # User-facing buy/sell request widget
        │   ├── SalvaSellerChat.jsx # Treasury management inbox
        │   └── Stars.jsx
        └── config.js               # SALVA_API_URL
```

---

## Backend

### Core Routes

**Auth**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/send-otp` | Sends a 6-digit OTP to email via Resend |
| `POST` | `/api/auth/verify-otp` | Validates OTP with constant-time comparison |
| `POST` | `/api/auth/reset-password` | Resets password after OTP verification |
| `POST` | `/api/login` | Authenticates and returns user session data |

**Wallet & Transfers**

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/balance/:address` | Returns NGNs, USDT, and USDC balances |
| `POST` | `/api/transfer` | Gasless ERC-20 transfer via the user's Safe |
| `GET` | `/api/transactions/:address` | Fetches transaction history |
| `GET` | `/api/registries` | Lists all active wallet registries for the send dropdown |
| `GET` | `/api/fee-config` | Returns tier-based fee config for NGNs transfers |

**Name Aliases**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/alias/link-name` | Backend signs the link request; returns prepared data |
| `POST` | `/api/alias/execute-link` | User's Safe executes the signed link on-chain |
| `POST` | `/api/alias/unlink-name` | Unlinks an alias via the user's Safe |
| `POST` | `/api/alias/check-name` | Checks on-chain availability for a name + registry pair |
| `GET` | `/api/alias/list/:safeAddress` | Returns all aliases linked to a wallet |
| `POST` | `/api/resolve-recipient` | Resolves a name alias to a wallet address |

**PIN Management**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/user/set-pin` | Sets a 4-digit PIN and encrypts the private key with it |
| `POST` | `/api/user/verify-pin` | Verifies PIN and returns the decrypted private key |
| `POST` | `/api/user/reset-pin` | Changes PIN after OTP verification |

---

### Admin & MultiSig Relay

All routes under `/api/admin/*` are gated by `requireValidator` middleware, which checks `user.isValidator` in MongoDB. They are mounted **after** the DB connection middleware so MongoDB is guaranteed connected before any Mongoose call runs.

The admin routes are thin wrappers — they validate input, call the corresponding function in `relayService.js` via the user's Safe, wait for confirmation, and sync the result into the `Proposal` collection in MongoDB. The frontend admin panel polls `/api/admin/proposals` every 15 seconds and syncs live vote counts directly from the on-chain MultiSig contract before returning.

Every on-chain governance operation follows the same three-step lifecycle enforced by the MultiSig contract:

```
proposeX()  →  validateX()  →  executeX()
                   ↑
       (24-hour timelock begins here
        once validator quorum is reached)
```

**Supported governance operations:**

| Operation | Routes |
|-----------|--------|
| Registry initialization | `propose-registry`, `validate-registry`, `execute-registry`, `cancel-registry` |
| Validator set management | `propose-validator`, `validate-validator`, `execute-validator`, `cancel-validator` |
| UUPS contract upgrades | `propose-upgrade`, `validate-upgrade`, `execute-upgrade`, `cancel-upgrade` |
| Backend signer rotation | `propose-signer-update`, `validate-signer-update`, `execute-signer-update`, `cancel-signer-update` |
| BaseRegistry impl update | `propose-base-registry-impl`, `validate-base-registry-impl`, `execute-base-registry-impl`, `cancel-base-registry-impl` |
| Pause / Unpause | `pause-state`, `propose-unpause`, `validate-unpause`, `execute-unpause`, `cancel-unpause` |
| Withdraw from Singleton | `withdraw` |
| Recovery address update | `update-recovery` |
| Factory fee update | `update-factory-fee` (immediate — no proposal required) |

---

### Buy/Sell NGNs

NGNs issuance and redemption are managed exclusively by the **Salva treasury**. There is no peer-to-peer component — a single authorized treasury account handles all minting and burning. The chat interface exists purely as the communication and verification layer between a user's request and the treasury's action.

**Buy flow — user requests NGNs in exchange for fiat:**

1. User submits a purchase request with the amount they want (`/initiate`) — backend responds with the Salva bank account details and opens a persistent chat thread
2. User makes the fiat bank transfer, then uploads their payment receipt to the thread (`/claim-paid`) — request status moves to `paid`
3. The Salva treasury operator reviews the thread in their `SalvaSellerChat` inbox, verifies the bank transfer, and confirms mint (`/confirm-mint`)
4. The backend wallet calls `ERC20.mint()` on the NGNs token contract — NGNs are credited to the user's Safe on-chain instantly

**Sell flow — user redeems NGNs for fiat:**

1. User submits a sell request with the amount and their bank account details (`/initiate-sell`)
2. The backend wallet calls `ERC20.burn()` immediately — NGNs are destroyed on-chain before any fiat moves
3. The Salva treasury operator sees the burn confirmation in their inbox and sends the equivalent fiat to the user's bank account
4. Treasury marks the request as complete (`/complete-sell`)

Both flows maintain a persistent per-user chat thread (one thread reused across all requests) that supports text messaging and image sharing between the user and the treasury operator. The thread is polled every 3 seconds when open.

---

### Relay Service

`relayService.js` is the engine that turns every user intent into a confirmed Safe transaction. The core function `_executeViaSafeBase`:

1. Initialises a `@safe-global/protocol-kit` instance signed by the user's decrypted private key
2. Creates and signs a Safe transaction targeting the protocol contract
3. Submits `Safe.execTransaction()` via the **backend wallet**, which pays all gas
4. Returns `{ txHash, receipt }`

For transfers that include a fee, `_sponsorTransfer` builds a `MultiSend` bundle — two ERC-20 transfers (to recipient + to treasury) packed into one atomic Safe call using the canonical Safe MultiSend contract at `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526`.

For name linking with a non-zero fee, `_sponsorLinkName` builds a MultiSend bundle combining `ERC20.approve(registry, fee)` and `BaseRegistry.link(nameBytes, wallet, signature)` so the approval and the link happen atomically.

---

### Security

| Layer | Implementation |
|-------|---------------|
| Rate limiting | 5 attempts / 15 min on auth endpoints; 100 req/min general |
| Helmet | Full security header suite on all responses |
| MongoDB injection | Manual sanitizer strips `$`-prefixed keys and dotted paths from every request body before Mongoose sees it |
| PIN encryption | User private keys encrypted with PBKDF2 (600k iterations) keyed to the user's PIN — plaintext never persists in the database |
| OTP comparison | `crypto.timingSafeEqual` prevents timing attacks |
| Account lockout | 24-hour lockout applied after any security-sensitive change |
| CORS | Explicit production domain allowlist; no wildcards in production |

---

## Frontend

### Pages

**`Home.jsx`** — Public landing page with animated live demos for the Salva Naming Service, Smart Wallet, and NGNs stablecoin. Fetches live `userCount` and `totalMinted` stats. Includes an FAQ accordion and a support contact modal that composes a pre-filled email.

**`Dashboard.jsx`** — The authenticated wallet interface. A swipeable balance card shows NGNs and USD balances separately. The send flow handles both address input and name resolution, supports NGNs / USDT / USDC, previews fees before confirmation, and gates execution behind a PIN modal. Tabs switch between Buy/Sell NGNs, Link a Name, Admin Panel (validators only), and Mint Requests (treasury only).

**`AdminPanel.jsx`** — Validator-only governance interface. Renders all active proposals from `/api/admin/proposals` with live on-chain vote counts and real-time timelock countdowns. Every action is gated behind a PIN modal that decrypts the validator's private key before the request hits the backend.

### Key Components

**`SalvaNGNsChat.jsx`** — Floating bottom-right widget visible to regular users. Handles the full buy and sell NGNs request cycle: amount entry with fee preview, bank detail collection for sell requests, real-time chat thread with the treasury, receipt upload for buy requests, and live status tracking. Polls every 3 seconds when a thread is open.

**`SalvaSellerChat.jsx`** — Floating bottom-left widget visible only to the Salva treasury account (`isSeller: true`). Lists all user request threads sorted by latest activity with unread badges. Inside a thread, the treasury operator can message the user, view uploaded payment receipts, confirm mint (buy requests), mark sell requests as complete, or reject invalid requests. Polls every 3–4 seconds.

**`RegistryDropdown`** — Searchable dropdown used in both the send flow and the link-name flow for selecting which wallet service (namespace/registry) applies to the recipient or the name being registered.

---

## How Gasless Transactions Work

Every transaction follows this exact path:

```
User enters PIN
      ↓
Backend verifies PIN → decrypts ownerPrivateKey from MongoDB
      ↓
relayService.js builds a Safe transaction
  { to: protocolContract, data: encodedCalldata, value: 0 }
      ↓
Safe SDK signs with ownerPrivateKey
      ↓
Backend wallet (gas payer) calls Safe.execTransaction()
  and pays ETH gas fee
      ↓
Safe executes the inner call — Safe address is msg.sender
      ↓
Protocol contract sees the user's Safe as the caller
```

From the protocol's perspective, the **user's Safe address is always `msg.sender`**. Name aliases are bound to the Safe. Ownership indexes are tied to the Safe. The backend wallet is invisible to the protocol — it only appears as the gas payer on the outer Safe transaction.

---

## Running Locally

```bash
# Clone the repository
git clone https://github.com/salva-Nexus/salva-web.git
cd salva-web

# Install dependencies
npm install

# Set up environment
cd packages/backend
cp .env.example .env
# Fill in all values in .env

# Start the backend
node src/index.js

# Start the frontend (separate terminal)
cd packages/frontend
npm run dev
```

The backend runs on port `3001` by default. Set `SALVA_API_URL=http://localhost:3001` in the frontend config for local development.

---

<div align="center">

Built on [Base](https://base.org) &nbsp;·&nbsp; Secured by [Safe](https://safe.global) &nbsp;·&nbsp; [salva-nexus.org](https://salva-nexus.org)

</div>