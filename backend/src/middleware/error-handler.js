export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    message: "Not Found",
    path: req.originalUrl
  });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  return res.status(status).json({
    message: err.message || "Internal Server Error"
  });
};
