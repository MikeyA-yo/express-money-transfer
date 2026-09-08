import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import {
  newTransfer,
  getTransferById,
  listTransfers
} from '../../services/transfer.js';
import {
  NotFoundError,
  InsufficientFundsError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Transfer Service Unit Tests (Mock Models & Sessions)', () => {
  let mockAccountModel;
  let mockTransferModel;
  let mockSession;

  beforeEach(() => {
    mockSession = {
      withTransaction: jest.fn(async (cb) => await cb()),
      endSession: jest.fn().mockResolvedValue(undefined)
    };

    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

    mockAccountModel = {
      findOne: jest.fn()
    };

    mockTransferModel = jest.fn().mockImplementation(function (data) {
      this.id = data.id || 'mock-transfer-id';
      this.fromAccountId = data.fromAccountId;
      this.toAccountId = data.toAccountId;
      this.amount = data.amount;
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({
        id: this.id,
        fromAccountId: this.fromAccountId,
        toAccountId: this.toAccountId,
        amount: this.amount
      });
    });
    mockTransferModel.findOne = jest.fn();
    mockTransferModel.find = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('newTransfer', () => {
    it('should throw NotFoundError if sender account does not exist', async () => {
      const mockQueryFrom = { session: jest.fn().mockResolvedValue(null) };
      const mockQueryTo = { session: jest.fn().mockResolvedValue({ id: 'acc-2', balance: '100' }) };

      mockAccountModel.findOne
        .mockReturnValueOnce(mockQueryFrom)
        .mockReturnValueOnce(mockQueryTo);

      await expect(
        newTransfer('acc-1', 'acc-2', 50, {
          Account: mockAccountModel,
          Transfer: mockTransferModel
        })
      ).rejects.toThrow(NotFoundError);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should throw InsufficientFundsError if sender balance is less than transfer amount', async () => {
      const accountFrom = {
        id: 'acc-1',
        balance: '30',
        save: jest.fn().mockResolvedValue(true)
      };
      const accountTo = {
        id: 'acc-2',
        balance: '100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQueryFrom = { session: jest.fn().mockResolvedValue(accountFrom) };
      const mockQueryTo = { session: jest.fn().mockResolvedValue(accountTo) };

      mockAccountModel.findOne
        .mockReturnValueOnce(mockQueryFrom)
        .mockReturnValueOnce(mockQueryTo);

      await expect(
        newTransfer('acc-1', 'acc-2', 50, {
          Account: mockAccountModel,
          Transfer: mockTransferModel
        })
      ).rejects.toThrow(InsufficientFundsError);

      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should complete transfer, update balances, and return formatted response with status COMPLETED', async () => {
      const accountFrom = {
        id: 'acc-1',
        balance: '100',
        save: jest.fn().mockResolvedValue(true)
      };
      const accountTo = {
        id: 'acc-2',
        balance: '50',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQueryFrom = { session: jest.fn().mockResolvedValue(accountFrom) };
      const mockQueryTo = { session: jest.fn().mockResolvedValue(accountTo) };

      mockAccountModel.findOne
        .mockReturnValueOnce(mockQueryFrom)
        .mockReturnValueOnce(mockQueryTo);

      const result = await newTransfer('acc-1', 'acc-2', 40, {
        Account: mockAccountModel,
        Transfer: mockTransferModel
      });

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('COMPLETED');
      expect(result.from).toBe('acc-1');
      expect(result.to).toBe('acc-2');
      expect(result.amount).toBe(40);
      expect(accountFrom.save).toHaveBeenCalled();
      expect(accountTo.save).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('getTransferById', () => {
    it('should return formatted transfer if found', async () => {
      mockTransferModel.findOne.mockResolvedValue({
        id: 'tr-1',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: '100',
        status: 'COMPLETED'
      });

      const result = await getTransferById('tr-1', { Transfer: mockTransferModel });

      expect(mockTransferModel.findOne).toHaveBeenCalledWith({ id: 'tr-1' });
      expect(result.id).toBe('tr-1');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(100);
    });

    it('should throw NotFoundError if transfer does not exist', async () => {
      mockTransferModel.findOne.mockResolvedValue(null);

      await expect(
        getTransferById('non-existent', { Transfer: mockTransferModel })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listTransfers', () => {
    it('should return paginated list of formatted transfers', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { id: 'tr-1', fromAccountId: 'a1', toAccountId: 'a2', amount: '50', status: 'COMPLETED' },
          { id: 'tr-2', fromAccountId: 'a2', toAccountId: 'a3', amount: '75', status: 'COMPLETED' }
        ])
      };
      mockTransferModel.find.mockReturnValue(mockQuery);

      const result = await listTransfers(1, 10, { Transfer: mockTransferModel });

      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(50);
      expect(result[0].status).toBe('COMPLETED');
    });
  });
});
