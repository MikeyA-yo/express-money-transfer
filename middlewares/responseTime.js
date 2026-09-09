/**
 * Response time middleware
 * Tracks request duration using high-resolution timer and sets X-Response-Time header
 */
export const responseTime = (req, res, next) => {
  const start = process.hrtime.bigint();

  // Intercept writeHead / end to set header before headers are sent
  const originalEnd = res.end;

  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const formattedDuration = `${durationMs.toFixed(2)}ms`;

    req.responseTime = formattedDuration;
    if (res.locals) {
      res.locals.responseTime = formattedDuration;
    }

    if (!res.headersSent && typeof res.setHeader === 'function') {
      res.setHeader('X-Response-Time', formattedDuration);
    }

    return originalEnd.apply(this, args);
  };

  next();
};

export default responseTime;
