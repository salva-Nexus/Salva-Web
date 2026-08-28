import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbReady } from './DB_connection.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';

import registerRoute from './routes/registration.js';
import setPinRoute from './routes/pin.js';
import otpRoute from './routes/otp.js';
import loginRoute from './routes/login.js';
import balanceRoute from './routes/balance.js';
import estimateFeeRoute from './routes/estimateFee.js';
import transferRoute from './routes/transfer.js';
import walletRegistryRoute from './routes/walletRegistry.js';
import resolverRoute from './routes/resolve.js';
import transactionRoute from './routes/transactions.js';
import pointsRecordRoute from './routes/points.js';
import userRecordRoute from './routes/Users.js';
import mintSantRoute from './routes/mintSant.js';
import linkNameRoute from './routes/sns.js';
import userDataRoute from './routes/userData.js';
import poolRoute from './routes/pool.js';
import swapRoute from './routes/swap.js';
import statsRouter from './routes/stats.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://www.salva-nexus.org',
      'www.salva-nexus.org',
      'https://salva-nexus.org',
      'https://salva-frontend.vercel.app',
    ],
    credentials: true,
  })
);

app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (err) {
    console.error('❌ DB not ready:', err.message);
    res.status(503).json({ message: 'Service temporarily unavailable, try again shortly' });
  }
});

// Auth & Base User Routes
app.use('/api/auth', otpRoute);
app.use('/api/user', registerRoute);
app.use('/api/user', loginRoute);

// Profile & Account Operations
app.use('/api/data', userDataRoute); // Updated path to prevent collision with registerRoute

// Wallet & Transaction Routes
app.use('/api/user', setPinRoute);
app.use('/api/user', balanceRoute);
app.use('/api/user', transferRoute);
app.use('/api/user', estimateFeeRoute);
app.use('/api/user', transactionRoute);
app.use('/api/user', mintSantRoute);
app.use('/api/user', linkNameRoute);
app.use('/api/user', swapRoute);

// Other Services
app.use('/api/sant', pointsRecordRoute);
app.use('/api/name', resolverRoute);
app.use('/api/registry', walletRegistryRoute);
app.use('/api/pool', poolRoute);
app.use('/api/data', statsRouter);
app.use('/api', userRecordRoute);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SALVA BACKEND ACTIVE ON PORT ${PORT}`);
});

const URL = 'https://salva-web.vercel.app/api/data/stats';

const INTERVAL = 10 * 60 * 1000;

function reloadWebsite() {
  fetch(URL)
    .then(() => console.log('⚓ Keep-Alive: Side-ping successful'))
    .catch((err) => console.error('⚓ Keep-Alive Error:', err.message));
}

setInterval(reloadWebsite, INTERVAL);
