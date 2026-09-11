import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/user.js';
import Admin from '../models/admin.js';
import Account from '../models/accounts.js';
import { createAccount } from './account.js';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError
} from '../common/domain-exceptions/domain-exceptions.js';

const DEFAULT_SECRET = 'express-money-transfer-jwt-secret-key-2026';

export const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_SECRET;

const models = {
  User,
  Admin,
  Account
};

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

/**
 * Authenticate credentials for a User or Admin and return a JWT token + user profile
 * @param {object} credentials - { email, password, role }
 * @param {object} [deps] - Dependency injection options
 * @returns {Promise<{ token: string, user: object }>}
 */
export async function login({ email, password, role } = {}, {
  User = models.User,
  Admin = models.Admin,
  comparePassword = bcrypt.compare
} = {}) {
  if (!email || !password) {
    throw BadRequestError('Email and password are required');
  }

  // 1. If role is explicitly specified as 'admin' or 'superadmin', check Admin model
  if (role === 'admin' || role === 'superadmin') {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      throw UnauthorizedError('Invalid email or password');
    }
    const isPasswordValid = await comparePassword(password, admin.password);
    if (!isPasswordValid) {
      throw UnauthorizedError('Invalid email or password');
    }

    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role || 'admin'
    };
    const token = generateToken(payload);
    return { token, user: payload };
  }

  // 2. If role is explicitly specified as 'user', check User model
  if (role === 'user') {
    const user = await User.findOne({ email });
    if (!user) {
      throw UnauthorizedError('Invalid email or password');
    }
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw UnauthorizedError('Invalid email or password');
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'user',
      accountId: user.accountId
    };
    const token = generateToken(payload);
    return { token, user: payload };
  }

  // 3. Auto-detect: check Admin first, then User
  const admin = await Admin.findOne({ email });
  if (admin) {
    const isPasswordValid = await comparePassword(password, admin.password);
    if (!isPasswordValid) {
      throw UnauthorizedError('Invalid email or password');
    }
    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role || 'admin'
    };
    const token = generateToken(payload);
    return { token, user: payload };
  }

  const user = await User.findOne({ email });
  if (user) {
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw UnauthorizedError('Invalid email or password');
    }
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'user',
      accountId: user.accountId
    };
    const token = generateToken(payload);
    return { token, user: payload };
  }

  throw UnauthorizedError('Invalid email or password');
}

/**
 * Get current authenticated user/admin profile
 * @param {object} userPayload - Claims from req.user
 * @param {object} [deps]
 */
export async function getCurrentProfile(userPayload, {
  User = models.User,
  Admin = models.Admin
} = {}) {
  if (!userPayload || !userPayload.id) {
    throw UnauthorizedError('Authentication required');
  }

  if (userPayload.role === 'admin' || userPayload.role === 'superadmin') {
    const admin = await Admin.findOne({ id: userPayload.id });
    if (admin) {
      return {
        id: admin.id,
        email: admin.email,
        role: admin.role
      };
    }
  } else {
    const user = await User.findOne({ id: userPayload.id });
    if (user) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'user',
        accountId: user.accountId
      };
    }
  }

  return userPayload;
}

/**
 * Register a new user, automatically create a linked account with a random balance,
 * and link the account id to the user.
 * @param {object} params - { name, email, password, initialBalance }
 * @param {object} [deps] - Dependency injection options
 * @returns {Promise<{ token: string, user: object, account: object }>}
 */
export async function signup({ name, email, password, initialBalance } = {}, {
  User = models.User,
  Account = models.Account,
  createAccountFn = createAccount,
  hashPassword = bcrypt.hash
} = {}) {
  if (!name || !email || !password) {
    throw BadRequestError('Name, email, and password are required');
  }

  // Check if user already exists with this email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ConflictError('User with this email already exists', { email });
  }

  // Generate random balance (e.g. between $100 and $2500) if not explicitly provided
  const balance = initialBalance !== undefined
    ? Number(initialBalance)
    : Number((Math.floor(Math.random() * 240000 + 10000) / 100).toFixed(2));

  // Automatically create a linked account (throws DuplicateAccountError if account email exists)
  const account = await createAccountFn(name, email, balance, { Account });

  // Hash password with bcrypt
  const passwordHash = await hashPassword(password, 10);

  // Create User linked to account.id
  const user = await User.create({
    id: account.id,
    name,
    email,
    accountId: account.id,
    password: passwordHash
  });

  const tokenPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'user',
    accountId: account.id
  };

  const token = generateToken(tokenPayload);

  return {
    token,
    user: tokenPayload,
    account
  };
}

