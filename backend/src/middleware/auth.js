/**
 * Middleware-driven Role-Based Access Control (RBAC).
 *
 * Rules:
 *  - There is NO Super Admin.
 *  - Roles are explicitly scoped with concrete permissions.
 *
 * Roles:
 *  - 'operator': CAN view corridor, observe live telemetry, view reports, inspect alerts.
 *                CANNOT modify hardware thresholds or alter safety policies.
 *  - 'engineer': CAN configure device profiles, tune thresholds (CPU/RAM/battery/bandwidth),
 *                trigger model pruning/quantization, view fleet logs.
 */

const ROLES = {
  OPERATOR: 'operator',
  ENGINEER: 'engineer',
};

const PERMISSIONS = {
  [ROLES.OPERATOR]: ['read:telemetry', 'read:guideline', 'read:reports'],
  [ROLES.ENGINEER]: ['read:telemetry', 'read:guideline', 'read:reports', 'write:thresholds', 'write:actuation', 'read:audit'],
};

function authenticate(req, res, next) {
  // Extract user role from header or query param; default to operator
  const role = req.headers['x-user-role'] || req.query.role || ROLES.OPERATOR;
  if (!Object.values(ROLES).includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Invalid role '${role}'. Allowed roles: ${Object.values(ROLES).join(', ')}`,
    });
  }
  req.user = {
    role,
    permissions: PERMISSIONS[role] || [],
  };
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.includes(permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user ? req.user.role : 'none'}' does not have required permission: '${permission}'`,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  PERMISSIONS,
  authenticate,
  requirePermission,
};

