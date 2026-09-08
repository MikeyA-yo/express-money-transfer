import { jest } from '@jest/globals';
import { createAccountHandler, getAccountHandler } from '../../controllers/account.js';
import { createTransferHandler, getTransferHandler } from '../../controllers/transfer.js';

describe('Controller Handlers Unit Tests (Dependency Injected Services)', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createAccountHandler', () => {
    it('should invoke injected service and return 201 with created account', async () => {
      mockReq.body = { name: 'Bob', email: 'bob@test.com', balance: 250 };
      const mockNewAccount = jest.fn().mockResolvedValue({
        id: 'acc-bob',
        name: 'Bob',
        email: 'bob@test.com',
        balance: 250
      });

      const handler = createAccountHandler({ newAccount: mockNewAccount });
      await handler(mockReq, mockRes);

      expect(mockNewAccount).toHaveBeenCalledWith('Bob', 'bob@test.com', 250);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        id: 'acc-bob',
        name: 'Bob',
        email: 'bob@test.com',
        balance: 250
      });
    });
  });

  describe('getAccountHandler', () => {
    it('should invoke injected service with param id and return 200', async () => {
      mockReq.params = { id: 'acc-123' };
      const mockGetAccount = jest.fn().mockResolvedValue({
        id: 'acc-123',
        name: 'Alice',
        email: 'alice@test.com',
        balance: 100
      });

      const handler = getAccountHandler({ getAccountById: mockGetAccount });
      await handler(mockReq, mockRes);

      expect(mockGetAccount).toHaveBeenCalledWith('acc-123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-123' }));
    });
  });

  describe('createTransferHandler', () => {
    it('should invoke injected service and return 201 with transfer result', async () => {
      mockReq.body = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 50 };
      const mockNewTransfer = jest.fn().mockResolvedValue({
        id: 'tr-1',
        from: 'acc-1',
        to: 'acc-2',
        amount: 50,
        status: 'COMPLETED'
      });

      const handler = createTransferHandler({ newTransfer: mockNewTransfer });
      await handler(mockReq, mockRes);

      expect(mockNewTransfer).toHaveBeenCalledWith('acc-1', 'acc-2', 50);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    });
  });

  describe('getTransferHandler', () => {
    it('should invoke injected service with param id and return 200', async () => {
      mockReq.params = { id: 'tr-999' };
      const mockGetTransfer = jest.fn().mockResolvedValue({
        id: 'tr-999',
        status: 'COMPLETED',
        amount: 100
      });

      const handler = getTransferHandler({ getTransferById: mockGetTransfer });
      await handler(mockReq, mockRes);

      expect(mockGetTransfer).toHaveBeenCalledWith('tr-999');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'tr-999' }));
    });
  });
});
