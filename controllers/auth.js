import { StatusCodes } from 'http-status-codes';
import * as authService from '../services/auth.js';
import { BadRequestError } from '../common/domain-exceptions/domain-exceptions.js';

export const signupHandler = ({ signup = authService.signup } = {}) => async (req, res) => {
  const { name, email, password, balance } = req.body || {};
  const result = await signup({ name, email, password, initialBalance: balance });
  return res.status(StatusCodes.CREATED).json(result);
};

export const loginHandler = ({ login = authService.login } = {}) => async (req, res) => {
  const { email, password, role } = req.body || {};
  const result = await login({ email, password, role });
  return res.status(StatusCodes.OK).json(result);
};

export const getProfileHandler = ({ getProfile = authService.getCurrentProfile } = {}) => async (req, res) => {
  const profile = await getProfile(req.user);
  return res.status(StatusCodes.OK).json({ user: profile });
};

export const issueTokenHandler = ({ generateToken = authService.generateToken } = {}) => async (req, res) => {
  const { email, role = 'user', id } = req.body || {};

  if (!email) {
    throw BadRequestError('Email is required to issue a token');
  }

  const userId = id || `user-${Date.now()}`;
  const payload = { id: userId, email, role };
  const token = generateToken(payload);

  return res.status(StatusCodes.OK).json({
    token,
    user: payload
  });
};
