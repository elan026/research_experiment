/**
 * Centralized production error-handling middleware.
 */

function errorHandler(err, req, res, next) {
  console.error('[Guideline-Layer API Error]:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred in Guideline Layer service.',
    status,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;

