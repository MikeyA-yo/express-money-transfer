import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { responseTime, requestId, authenticate, authorize, requireRole, requireRoles } from '../../middlewares/index.js';
import { UnauthorizedError, ForbiddenError } from '../../common/domain-exceptions/domain-exceptions.js';

describe('Middlewares Unit Tests', () => {
  describe('responseTime middleware', () => {
    it('should set X-Response-Time header and attach req.responseTime on res.end', () => {
      const req = {};
      const setHeaderMock = mock.fn();
      const endMock = mock.fn();
      const res = {
        headersSent: false,
        locals: {},
        setHeader: setHeaderMock,
        end: endMock
      };
      const next = mock.fn();

      responseTime(req, res, next);
      assert.strictEqual(next.mock.callCount(), 1);

      // Trigger patched res.end
      res.end();

      assert.strictEqual(setHeaderMock.mock.callCount(), 1);
      assert.strictEqual(setHeaderMock.mock.calls[0].arguments[0], 'X-Response-Time');
      assert.match(setHeaderMock.mock.calls[0].arguments[1], /ms$/);
      assert.match(req.responseTime, /ms$/);
      assert.match(res.locals.responseTime, /ms$/);
    });
  });

  describe('requestId middleware', () => {
    it('should generate a UUID when X-Request-Id header is not provided', () => {
      const req = { headers: {} };
      const setHeaderMock = mock.fn();
      const res = { setHeader: setHeaderMock };
      const next = mock.fn();

      requestId(req, res, next);

      assert.strictEqual(next.mock.callCount(), 1);
      assert.ok(req.id);
      assert.strictEqual(typeof req.id, 'string');
      assert.strictEqual(setHeaderMock.mock.callCount(), 1);
      assert.deepStrictEqual(setHeaderMock.mock.calls[0].arguments, ['X-Request-Id', req.id]);
    });

    it('should preserve and propagate incoming X-Request-Id header', () => {
      const req = { headers: { 'x-request-id': 'custom-trace-123' } };
      const setHeaderMock = mock.fn();
      const res = { setHeader: setHeaderMock };
      const next = mock.fn();

      requestId(req, res, next);

      assert.strictEqual(req.id, 'custom-trace-123');
      assert.strictEqual(setHeaderMock.mock.callCount(), 1);
      assert.deepStrictEqual(setHeaderMock.mock.calls[0].arguments, ['X-Request-Id', 'custom-trace-123']);
    });
  });

  describe('authenticate middleware', () => {
    it('should throw UnauthorizedError when Authorization header is missing', () => {
      const req = { headers: {} };
      const res = {};
      const next = mock.fn();
      const authMiddleware = authenticate();

      assert.throws(() => authMiddleware(req, res, next), UnauthorizedError);
      assert.strictEqual(next.mock.callCount(), 0);
    });

    it('should throw UnauthorizedError when Authorization header format is not Bearer', () => {
      const req = { headers: { authorization: 'Basic 12345' } };
      const res = {};
      const next = mock.fn();
      const authMiddleware = authenticate();

      assert.throws(() => authMiddleware(req, res, next), UnauthorizedError);
    });

    it('should throw UnauthorizedError when verifyToken rejects/throws', () => {
      const req = { headers: { authorization: 'Bearer invalid.token' } };
      const res = {};
      const next = mock.fn();
      const mockVerify = mock.fn(() => {
        throw new Error('jwt malformed');
      });

      const authMiddleware = authenticate({ verifyToken: mockVerify });

      assert.throws(() => authMiddleware(req, res, next), UnauthorizedError);
      assert.strictEqual(mockVerify.mock.callCount(), 1);
      assert.deepStrictEqual(mockVerify.mock.calls[0].arguments, ['invalid.token']);
    });

    it('should attach req.user and call next() when token is valid', () => {
      const req = { headers: { authorization: 'Bearer valid.jwt.token' } };
      const res = {};
      const next = mock.fn();
      const mockDecoded = { id: 'u1', email: 'u1@test.com', role: 'admin' };
      const mockVerify = mock.fn(() => mockDecoded);

      const authMiddleware = authenticate({ verifyToken: mockVerify });
      authMiddleware(req, res, next);

      assert.strictEqual(mockVerify.mock.callCount(), 1);
      assert.deepStrictEqual(mockVerify.mock.calls[0].arguments, ['valid.jwt.token']);
      assert.deepStrictEqual(req.user, mockDecoded);
      assert.strictEqual(next.mock.callCount(), 1);
    });
  });

  describe('authorize middleware', () => {
    it('should throw UnauthorizedError if req.user is missing', () => {
      const req = {};
      const res = {};
      const next = mock.fn();

      assert.throws(() => authorize('admin')(req, res, next), UnauthorizedError);
    });

    it('should throw ForbiddenError if req.user role is not in allowedRoles', () => {
      const req = { user: { id: 'u1', role: 'user' } };
      const res = {};
      const next = mock.fn();

      assert.throws(() => authorize('admin')(req, res, next), ForbiddenError);
      assert.strictEqual(next.mock.callCount(), 0);
    });

    it('should call next() if req.user role matches allowedRoles', () => {
      const req = { user: { id: 'u1', role: 'admin' } };
      const res = {};
      const next = mock.fn();

      authorize('admin')(req, res, next);
      assert.strictEqual(next.mock.callCount(), 1);
    });
  });

  describe('requireRole middleware', () => {
    it('should throw UnauthorizedError if req.user is missing or role does not match', () => {
      const next = mock.fn();
      assert.throws(() => requireRole('admin')({}, {}, next), UnauthorizedError);
      assert.throws(() => requireRole('admin')({ user: { role: 'user' } }, {}, next), UnauthorizedError);
      assert.strictEqual(next.mock.callCount(), 0);
    });

    it('should call next() if req.user role matches', () => {
      const next = mock.fn();
      requireRole('admin')({ user: { role: 'admin' } }, {}, next);
      assert.strictEqual(next.mock.callCount(), 1);
    });
  });

  describe('requireRoles middleware', () => {
    it('should throw UnauthorizedError if req.user is missing or role is not in roles list', () => {
      const next = mock.fn();
      assert.throws(() => requireRoles(['admin', 'superadmin'])({}, {}, next), UnauthorizedError);
      assert.throws(() => requireRoles(['admin', 'superadmin'])({ user: { role: 'user' } }, {}, next), UnauthorizedError);
      assert.strictEqual(next.mock.callCount(), 0);
    });

    it('should call next() if req.user role is in roles list', () => {
      const next = mock.fn();
      requireRoles(['admin', 'superadmin'])({ user: { role: 'superadmin' } }, {}, next);
      assert.strictEqual(next.mock.callCount(), 1);
    });
  });
});
