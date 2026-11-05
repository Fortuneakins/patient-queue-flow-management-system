function notFound(req, res) {
  res.status(404).json({ error: 'Resource not found.' });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const status = Number(error.status) || (error.code === '23505' ? 409 : 500);
  // Avoid logging query strings/identifiers and stack traces in production.
  if (process.env.NODE_ENV === 'production') {
    console.error(`[${new Date().toISOString()}] request failed: ${req.method} ${req.route?.path || req.path} (status ${status})`);
  } else {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  }
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message });
}

module.exports = { notFound, errorHandler };
