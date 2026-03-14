const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.role !== 'employee') {
      return res.status(403).json({ error: 'Employee access required' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
