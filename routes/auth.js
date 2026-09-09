import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { generateToken } from '../services/auth.js';
import { BadRequestError } from '../common/domain-exceptions/domain-exceptions.js';

const router = Router();

/**
 * Issue an authentication token for testing or client sessions
 * POST /api/v1/auth/token
 */
router.post('/token', (req, res) => {
  const { email, role = 'user', id } = req.body || {};

  if (!email) {
    throw BadRequestError('Email is required to issue a token');
  }

  const userId = id || `user-${Date.now()}`;
  const payload = { id: userId, email, role };
  const token = generateToken(payload);

  return res.status(StatusCodes.OK).json({
    token,
    user: payload
  });
});

export default router;
