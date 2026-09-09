import jwt from 'jsonwebtoken';

const DEFAULT_SECRET = 'express-money-transfer-jwt-secret-key-2026';

export const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_SECRET;

/**
 * Generate a signed JWT token
 * @param {object} payload - User claims e.g. { id, email, role }
 * @param {object} [options={}] - JWT sign options
 * @returns {string} Signed JWT token
 */
export function generateToken(payload, options = {}) {
  const secret = getJwtSecret();
  const signOptions = {
    expiresIn: '1h',
    ...options
  };

  return jwt.sign(payload, secret, signOptions);
}

/**
 * Verify and decode a JWT token
 * @param {string} token - Bearer JWT token
 * @returns {object} Decoded token payload
 */
export function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}
