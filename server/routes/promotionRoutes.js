// server/routes/promotionRoutes.js

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const promotionController = require('../controllers/promotionController');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

// Validation middleware
const promotionValidation = [
    body('code')
        .isLength({ min: 3, max: 50 })
        .withMessage('Mã khuyến mãi phải từ 3-50 ký tự')
        .matches(/^[A-Z0-9_-]+$/)
        .withMessage('Mã khuyến mãi chỉ được chứa chữ hoa, số, dấu gạch dưới và gạch ngang'),
    body('discount_type')
        .isIn(['percent', 'fixed'])
        .withMessage('Loại giảm giá phải là percent hoặc fixed'),
    body('discount_value')
        .isInt({ min: 1 })
        .withMessage('Giá trị giảm giá phải là số nguyên dương'),
    body('min_order_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Tổng đơn hàng tối thiểu phải là số không âm'),
    body('usage_limit')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Giới hạn sử dụng phải là số nguyên dương')
];

const validatePromotionValidation = [
    body('code')
        .notEmpty()
        .withMessage('Mã khuyến mãi là bắt buộc'),
    body('order_amount')
        .isFloat({ min: 0 })
        .withMessage('Tổng đơn hàng phải là số không âm')
];

// Public routes
router.get('/', promotionController.getActivePromotions);
router.post('/validate', validatePromotionValidation, promotionController.validatePromotion);

// Admin routes - require authentication and admin role
router.post('/', authenticateToken, requireAdmin, promotionValidation, promotionController.createPromotion);
router.get('/admin/all', authenticateToken, requireAdmin, promotionController.getAllPromotions);
router.put('/:id', authenticateToken, requireAdmin, promotionValidation, promotionController.updatePromotion);
router.delete('/:id', authenticateToken, requireAdmin, promotionController.deletePromotion);

module.exports = router;