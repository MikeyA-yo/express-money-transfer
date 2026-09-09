import { UnauthorizedError, ForbiddenError } from '../common/domain-exceptions/domain-exceptions.js';

/**
 * Role-based authorization middleware
 * @param {...string} allowedRoles - Roles permitted to access the route e.g. 'admin', 'user'
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    throw UnauthorizedError('Authentication required');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
    throw ForbiddenError('Forbidden: Insufficient permissions', {
      requiredRoles: allowedRoles,
      userRole: req.user.role
    });
  }

  next();
};

export default authorize;
