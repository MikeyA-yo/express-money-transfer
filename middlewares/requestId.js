import crypto from 'crypto';

/**
 * Request ID middleware
 * Assigns or propagates a unique correlation ID for distributed request tracing
 */
export const requestId = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const correlationId = incomingId || crypto.randomUUID();

  req.id = correlationId;
  res.setHeader('X-Request-Id', correlationId);

  next();
};

export default requestId;
