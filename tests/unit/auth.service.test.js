import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateToken,
  verifyToken,
  login,
  getCurrentProfile,
  signup
} from '../../services/auth.js';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Auth Service Unit Tests', () => {
  describe('generateToken & verifyToken', () => {
    it('should generate a valid JWT and decode it correctly', () => {
      const payload = { id: 'usr-1', email: 'test@example.com', role: 'user' };
      const token = generateToken(payload);
      assert.ok(typeof token === 'string');

      const decoded = verifyToken(token);
      assert.strictEqual(decoded.id, 'usr-1');
      assert.strictEqual(decoded.email, 'test@example.com');
      assert.strictEqual(decoded.role, 'user');
    });
  });

  describe('signup', () => {
    it('should throw BadRequestError if name, email, or password missing', async () => {
      await assert.rejects(signup({ name: 'Bob', email: '' }), BadRequestError);
      await assert.rejects(signup({ name: 'Bob', password: 'pass' }), BadRequestError);
      await assert.rejects(signup({ email: 'bob@test.com', password: 'pass' }), BadRequestError);
    });

    it('should throw ConflictError if user with email already exists', async () => {
      const mockUserModel = {
        findOne: mock.fn(async () => ({ id: 'usr-1', email: 'existing@test.com' }))
      };

      await assert.rejects(
        signup(
          { name: 'Existing', email: 'existing@test.com', password: 'pass' },
          { User: mockUserModel }
        ),
        ConflictError
      );
    });

    it('should create account with random balance, hash password, and link accountId to user', async () => {
      const mockUserModel = {
        findOne: mock.fn(async () => null),
        create: mock.fn(async (userData) => ({
          ...userData,
          id: userData.id
        }))
      };
      const mockCreateAccount = mock.fn(async (name, email, balance) => ({
        id: 'acc-new-777',
        name,
        email,
        balance
      }));
      const mockHash = mock.fn(async () => '$2b$10$mockedbcrypt');

      const result = await signup(
        { name: 'Charlie', email: 'charlie@test.com', password: 'secretpassword' },
        {
          User: mockUserModel,
          createAccountFn: mockCreateAccount,
          hashPassword: mockHash
        }
      );

      assert.ok(result.token);
      assert.strictEqual(result.user.name, 'Charlie');
      assert.strictEqual(result.user.email, 'charlie@test.com');
      assert.strictEqual(result.user.accountId, 'acc-new-777');
      assert.strictEqual(result.account.id, 'acc-new-777');
      assert.ok(result.account.balance >= 100);
      assert.strictEqual(mockCreateAccount.mock.callCount(), 1);
      assert.strictEqual(mockHash.mock.callCount(), 1);
      assert.strictEqual(mockUserModel.create.mock.callCount(), 1);
      assert.strictEqual(mockUserModel.create.mock.calls[0].arguments[0].accountId, 'acc-new-777');
      assert.strictEqual(mockUserModel.create.mock.calls[0].arguments[0].password, '$2b$10$mockedbcrypt');
    });
  });

  describe('login', () => {
    it('should throw BadRequestError if email or password missing', async () => {
      await assert.rejects(login({ email: '' }), BadRequestError);
      await assert.rejects(login({ email: 'a@b.com' }), BadRequestError);
    });

    it('should authenticate admin when role=admin and password matches', async () => {
      const mockAdmin = {
        id: 'adm-1',
        email: 'admin@bank.com',
        role: 'admin',
        password: '$2b$10$hashedpassword'
      };
      const mockAdminModel = {
        findOne: mock.fn(async () => mockAdmin)
      };
      const mockCompare = mock.fn(async () => true);

      const result = await login(
        { email: 'admin@bank.com', password: 'secret', role: 'admin' },
        { Admin: mockAdminModel, comparePassword: mockCompare }
      );

      assert.ok(result.token);
      assert.strictEqual(result.user.email, 'admin@bank.com');
      assert.strictEqual(result.user.role, 'admin');
    });

    it('should throw UnauthorizedError when admin password does not match', async () => {
      const mockAdmin = {
        id: 'adm-1',
        email: 'admin@bank.com',
        role: 'admin',
        password: '$2b$10$hashedpassword'
      };
      const mockAdminModel = {
        findOne: mock.fn(async () => mockAdmin)
      };
      const mockCompare = mock.fn(async () => false);

      await assert.rejects(
        login(
          { email: 'admin@bank.com', password: 'wrong', role: 'admin' },
          { Admin: mockAdminModel, comparePassword: mockCompare }
        ),
        UnauthorizedError
      );
    });

    it('should authenticate user and return accountId in payload', async () => {
      const mockUser = {
        id: 'usr-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'user',
        accountId: 'acc-1',
        password: '$2b$10$hashedpassword'
      };
      const mockUserModel = {
        findOne: mock.fn(async () => mockUser)
      };
      const mockCompare = mock.fn(async () => true);

      const result = await login(
        { email: 'alice@example.com', password: 'secret', role: 'user' },
        { User: mockUserModel, comparePassword: mockCompare }
      );

      assert.ok(result.token);
      assert.strictEqual(result.user.email, 'alice@example.com');
      assert.strictEqual(result.user.name, 'Alice');
      assert.strictEqual(result.user.accountId, 'acc-1');
    });
  });

  describe('getCurrentProfile', () => {
    it('should return admin profile for admin claim', async () => {
      const mockAdmin = { id: 'adm-1', email: 'admin@b.com', role: 'admin' };
      const mockAdminModel = { findOne: mock.fn(async () => mockAdmin) };

      const profile = await getCurrentProfile(
        { id: 'adm-1', email: 'admin@b.com', role: 'admin' },
        { Admin: mockAdminModel }
      );

      assert.strictEqual(profile.email, 'admin@b.com');
      assert.strictEqual(profile.role, 'admin');
    });

    it('should return user profile for user claim', async () => {
      const mockUser = { id: 'usr-1', name: 'Bob', email: 'bob@b.com', role: 'user', accountId: 'acc-2' };
      const mockUserModel = { findOne: mock.fn(async () => mockUser) };

      const profile = await getCurrentProfile(
        { id: 'usr-1', email: 'bob@b.com', role: 'user' },
        { User: mockUserModel }
      );

      assert.strictEqual(profile.name, 'Bob');
      assert.strictEqual(profile.accountId, 'acc-2');
    });
  });
});
