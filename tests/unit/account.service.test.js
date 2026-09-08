import { jest } from '@jest/globals';
import {
  createAccount,
  fetchAccounts,
  getAccountById,
  editAccount,
  removeAccount
} from '../../services/account.js';
import {
  DuplicateAccountError,
  NotFoundError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Account Service Unit Tests (Mock Models)', () => {
  let mockAccountModel;

  beforeEach(() => {
    mockAccountModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn()
    };
  });

  describe('createAccount', () => {
    it('should create an account when email is not duplicate', async () => {
      mockAccountModel.findOne.mockResolvedValue(null);
      mockAccountModel.create.mockResolvedValue({
        id: 'acc-123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        balance: 500
      });

      const result = await createAccount(
        'Jane Doe',
        'jane@example.com',
        500,
        { Account: mockAccountModel }
      );

      expect(mockAccountModel.findOne).toHaveBeenCalledWith({ email: 'jane@example.com' });
      expect(mockAccountModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          balance: 500
        })
      );
      expect(result).toEqual({
        id: 'acc-123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        balance: 500
      });
    });

    it('should throw DuplicateAccountError when email already exists', async () => {
      mockAccountModel.findOne.mockResolvedValue({ id: 'existing-id', email: 'jane@example.com' });

      await expect(
        createAccount('Jane Doe', 'jane@example.com', 500, { Account: mockAccountModel })
      ).rejects.toThrow(DuplicateAccountError);

      expect(mockAccountModel.create).not.toHaveBeenCalled();
    });
  });

  describe('fetchAccounts', () => {
    it('should fetch paginated accounts and format them', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { id: '1', name: 'User 1', email: 'u1@test.com', balance: 100 },
          { id: '2', name: 'User 2', email: 'u2@test.com', balance: 200 }
        ])
      };
      mockAccountModel.find.mockReturnValue(mockQuery);

      const result = await fetchAccounts(1, 10, { Account: mockAccountModel });

      expect(mockAccountModel.find).toHaveBeenCalled();
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 'User 1', email: 'u1@test.com', balance: 100 });
    });
  });

  describe('getAccountById', () => {
    it('should return account response when account exists', async () => {
      mockAccountModel.findOne.mockResolvedValue({
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 300
      });

      const result = await getAccountById('acc-1', { Account: mockAccountModel });

      expect(mockAccountModel.findOne).toHaveBeenCalledWith({ id: 'acc-1' });
      expect(result).toEqual({
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 300
      });
    });

    it('should throw NotFoundError when account does not exist', async () => {
      mockAccountModel.findOne.mockResolvedValue(null);

      await expect(
        getAccountById('non-existent', { Account: mockAccountModel })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('editAccount', () => {
    it('should update and return formatted account', async () => {
      mockAccountModel.findOneAndUpdate.mockResolvedValue({
        id: 'acc-1',
        name: 'Alice Updated',
        email: 'alice@example.com',
        balance: 400
      });

      const result = await editAccount('acc-1', 'Alice Updated', 'alice@example.com', 400, {
        Account: mockAccountModel
      });

      expect(mockAccountModel.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 'acc-1' },
        { name: 'Alice Updated', email: 'alice@example.com', balance: 400 },
        { new: true }
      );
      expect(result.name).toBe('Alice Updated');
      expect(result.balance).toBe(400);
    });

    it('should throw NotFoundError if account to edit is not found', async () => {
      mockAccountModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        editAccount('non-existent', 'Name', 'email@test.com', 100, { Account: mockAccountModel })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeAccount', () => {
    it('should delete and return account response', async () => {
      mockAccountModel.findOneAndDelete.mockResolvedValue({
        id: 'acc-1',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 100
      });

      const result = await removeAccount('acc-1', { Account: mockAccountModel });

      expect(mockAccountModel.findOneAndDelete).toHaveBeenCalledWith({ id: 'acc-1' });
      expect(result.id).toBe('acc-1');
    });

    it('should throw NotFoundError if account to delete is not found', async () => {
      mockAccountModel.findOneAndDelete.mockResolvedValue(null);

      await expect(
        removeAccount('non-existent', { Account: mockAccountModel })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
