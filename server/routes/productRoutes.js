// server/routes/productRoutes.js - Fixed version

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

// Validation middleware
const productValidation = [
    body('name')
        .isLength({ min: 2, max: 100 })
        .withMessage('Tên sản phẩm phải từ 2-100 ký tự'),
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Giá phải là số dương'),
    body('stock')
        .isInt({ min: 0 })
        .withMessage('Tồn kho phải là số nguyên không âm'),
    body('category_id')
        .isInt({ min: 1 })
        .withMessage('Danh mục không hợp lệ'),
    body('discount_percent')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Phần trăm giảm giá phải từ 0-100')
];

const reviewValidation = [
    body('productId')
        .isInt({ min: 1 })
        .withMessage('ID sản phẩm không hợp lệ'),
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Đánh giá phải từ 1-5 sao'),
    body('comment')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Bình luận không được quá 1000 ký tự')
];

// Public routes - đặt các route cụ thể trước
router.get('/featured', productController.getFeaturedProducts);
router.get('/new', productController.getNewProducts);

// Route cho tất cả sản phẩm - đặt sau các route cụ thể
router.get('/', productController.getAllProducts);

// Protected routes - require authentication  
router.post('/review', authenticateToken, requireUser, reviewValidation, productController.addReview);

// Admin routes - tạo sản phẩm mới
router.post('/', authenticateToken, requireAdmin, productValidation, productController.createProduct);

// CRITICAL: Route với parameter phải đặt cuối cùng để tránh xung đột
// Route này sẽ match mọi GET request dạng /products/:anything
router.get('/:productId', productController.getProductById);
router.put('/:productId', authenticateToken, requireAdmin, productValidation, productController.updateProduct);
router.delete('/:productId', authenticateToken, requireAdmin, productController.deleteProduct);

module.exports = router;