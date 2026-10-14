function notFound(req, res) {
  res.status(404).json({ error: 'Resource not found.' });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  const status = Number(error.status) || (error.code === '23505' ? 409 : 500);
  res.status(status).json({ error: status === 500 ? 'Internal server error.' : error.message });
}

module.exports = { notFound, errorHandler };
