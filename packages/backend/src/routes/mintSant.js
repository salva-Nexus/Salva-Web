import express from 'express';
import mintSant from '../services/santMint.js';
import validator from 'validator';

const router = express.Router();

function sanitizeData(data, isEmail) {
  if (typeof data !== 'string') {
    throw new Error('Invalid data format');
  }
  const sanitized = data.trim().toLowerCase();
  if (isEmail) {
    if (!validator.isEmail(sanitized)) {
      throw new Error('Invalid email format');
    }
  }
  return sanitized;
}

router.post('/mint-sant', async (req, res) => {
  const { email, address, pKey } = req.body;

  try {
    const data = await mintSant(sanitizeData(email, true), address, pKey);
    if (data.status) {
      res.status(200).json({
        status: data.status,
        data: data.txHash,
      });
    } else {
      res.status(400).json({
        status: false,
      });
    }
  } catch (err) {
    console.error(err.meesage);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
