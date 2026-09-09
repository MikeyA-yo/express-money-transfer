import { UnauthorizedError } from '../common/domain-exceptions/domain-exceptions.js';
import * as authService from '../services/auth.js';

/**
 * Authentication middleware factory
 * Supports dependency injection of token verification for testability
 */
export const authenticate = ({ verifyToken = authService.verifyToken } = {}) => (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw UnauthorizedError('Authentication required');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw UnauthorizedError('Authentication token missing');
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    throw UnauthorizedError('Invalid or expired token', { reason: error.message });
  }
};

export default authenticate();
