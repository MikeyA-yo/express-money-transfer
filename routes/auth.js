import { Router } from 'express';
import { authenticate } from '../middlewares/index.js';
import {
  signupHandler,
  loginHandler,
  getProfileHandler,
  issueTokenHandler
} from '../controllers/auth.js';

const router = Router();

/**
 * Public Authentication Endpoints
 */
// Register a new user, create an account with a random balance, and link accountId
router.post('/signup', signupHandler());

// Authenticate user or admin with email and password
router.post('/login', loginHandler());

// Issue a token for testing / token generator
router.post('/token', issueTokenHandler());

/**
 * Protected Authentication Endpoints
 * Uses authenticate middleware to verify token and identify current user/admin
 */
router.get('/me', authenticate(), getProfileHandler());

export default router;
