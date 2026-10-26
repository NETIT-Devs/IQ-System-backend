
function superAdminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
  }

  if (req.user.role !== "Super Admin") {
    return res.status(403).json({
      success: false,
      message: "Only Super Admin can manage company settings.",
    });
  }

  next();
}

module.exports = superAdminMiddleware;
