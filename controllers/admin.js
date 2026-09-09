import { StatusCodes } from 'http-status-codes';
import * as adminService from '../services/admin.js';

export const getSystemStatsHandler = ({ getStats = adminService.getSystemStats } = {}) => async (req, res) => {
  const stats = await getStats();
  return res.status(StatusCodes.OK).json(stats);
};

export const getAllTransfersAuditHandler = ({ getAllTransfers = adminService.getAllTransfersAudit } = {}) => async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const transfers = await getAllTransfers(page, limit);
  return res.status(StatusCodes.OK).json(transfers);
};
