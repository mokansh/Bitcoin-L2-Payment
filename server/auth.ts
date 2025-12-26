import express from 'express';
import bitcoinMessage from 'bitcoinjs-message';

const router = express.Router();

// POST /api/auth/verify-signature
router.post('/verify-signature', async (req, res) => {
  const { address, message, signature } = req.body;
  if (!address || !message || !signature) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    const isValid = bitcoinMessage.verify(message, address, signature);
    if (isValid) {
      // Optionally, set a session or JWT here
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Verification failed' });
  }
});

export default router;
