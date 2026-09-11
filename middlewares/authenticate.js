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

  const [scheme, token] = authHeader.split(' ');
  if(scheme !== 'Bearer') {
    throw UnauthorizedError('Invalid authentication scheme');
  }
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

export const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    throw UnauthorizedError('Insufficient permissions');
  }
  next();
};

export const requireRoles = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw UnauthorizedError('Insufficient permissions');
  }
  next();
};

export const requireAllRoles = (roles) => (req, res, next) => {
  if (!req.user || !roles.every(role => req.user.roles.includes(role))) {
    throw UnauthorizedError('Insufficient permissions');
  }
  next();
}

export default authenticate();
