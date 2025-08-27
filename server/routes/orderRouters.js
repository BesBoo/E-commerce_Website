// orderRouter.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

// Validation middleware
const createOrderValidation = [
    body('items')
        .isArray({ min: 1 })
        .withMessage('Giỏ hàng không được trống'),
    body('items.*.product_id')
        .isInt({ min: 1 })
        .withMessage('ID sản phẩm không hợp lệ'),
    body('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('Số lượng phải là số nguyên dương'),
    body('shipping_address')
        .isLength({ min: 10, max: 255 })
        .withMessage('Địa chỉ giao hàng phải từ 10-255 ký tự'),
    body('phone')
        .isMobilePhone('vi-VN')
        .withMessage('Số điện thoại không hợp lệ'),
    body('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Ghi chú không được quá 500 ký tự')
];

const updateOrderStatusValidation = [
    body('status')
        .isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
        .withMessage('Trạng thái đơn hàng không hợp lệ')
];

// Admin routes (đặt trước route động)
router.get('/admin/stats', authenticateToken, requireAdmin, orderController.getOrderStats);
router.get('/admin/all', authenticateToken, requireAdmin, orderController.getAllOrders);
router.put('/:orderId/status', authenticateToken, requireAdmin, updateOrderStatusValidation, orderController.updateOrderStatus);

// User routes
router.post('/', authenticateToken, requireUser, createOrderValidation, orderController.createOrder);
router.get('/my-orders', authenticateToken, requireUser, orderController.getUserOrders);
router.put('/:orderId/cancel', authenticateToken, requireUser, orderController.cancelOrder);
router.get('/:orderId', authenticateToken, requireUser, orderController.getOrderById);

module.exports = router;