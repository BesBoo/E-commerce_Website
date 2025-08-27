// routes/userRouters.js - Fixed version
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

// Validation middleware
const registerValidation = [
    body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username phải từ 3-50 ký tự')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username chỉ được chứa chữ cái, số và dấu gạch dưới'),
    body('email')
        .isEmail()
        .withMessage('Email không hợp lệ')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
        // Bỏ regex phức tạp tạm thời để test
        // .matches(/^(?=.[a-z])(?=.[A-Z])(?=.*\d)/)
        // .withMessage('Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),
    body('phone')
        .optional()
        .isLength({ min: 10, max: 15 })
        .withMessage('Số điện thoại không hợp lệ'),
    body('full_name')
        .optional()
        .isLength({ min: 2, max: 100 })
        .withMessage('Họ tên phải từ 2-100 ký tự')
];

const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Vui lòng nhập mật khẩu hiện tại'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
        // Bỏ regex phức tạp tạm thời
        // .matches(/^(?=.[a-z])(?=.[A-Z])(?=.*\d)/)
        // .withMessage('Mật khẩu mới phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số')
];

// Middleware to log requests
router.use((req, res, next) => {
    console.log(`${req.method} /api/users${req.path} - Body:`, req.body);
    next();
});

// Test route
router.get('/test', (req, res) => {
    res.json({ 
        message: 'User routes working!', 
        timestamp: new Date().toISOString() 
    });
});

// Database test route
router.get('/test-db', userController.testDB);

// Public routes
router.post('/register', registerValidation, userController.register);
router.post('/login', userController.login);

// Protected routes - require authentication
router.get('/profile', authenticateToken, requireUser, userController.getProfile);
router.put('/profile', authenticateToken, requireUser, userController.updateProfile);
router.put('/change-password', authenticateToken, requireUser, changePasswordValidation, userController.changePassword);

// Admin routes - require admin role
router.get('/all', authenticateToken, requireAdmin, userController.getAllUsers);
router.put('/role', authenticateToken, requireAdmin, userController.updateUserRole);

// Error handling for this router
router.use((error, req, res, next) => {
    console.error('❌ User router error:', error);
    res.status(500).json({ 
        message: 'User router error', 
        error: error.message 
    });
});

module.exports = router;