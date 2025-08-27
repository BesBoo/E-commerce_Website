// server/routes/cartRoutes.js - FIXED VERSION

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticateToken, requireUser } = require('../middleware/auth');

// Validation middleware
const addToCartValidation = [
    body('product_id')
        .isInt({ min: 1 })
        .withMessage('ID sản phẩm không hợp lệ'),
    body('quantity')
        .optional()
        .isInt({ min: 1, max: 99 })
        .withMessage('Số lượng phải từ 1-99'),
    body('color')
        .optional({ nullable: true })
        .isLength({ max: 50 })
        .withMessage('Màu sắc không được quá 50 ký tự'),
    body('size')
        .optional({ nullable: true })
        .isLength({ max: 20 })
        .withMessage('Kích thước không được quá 20 ký tự')
];

const updateQuantityValidation = [
    body('quantity')
        .isInt({ min: 1, max: 99 })
        .withMessage('Số lượng phải từ 1-99')
];

const removeByProductValidation = [
    body('product_id')
        .isInt({ min: 1 })
        .withMessage('ID sản phẩm không hợp lệ')
];

const checkoutValidation = [
    body('shipping_address')
        .isLength({ min: 10, max: 255 })
        .withMessage('Địa chỉ giao hàng phải từ 10-255 ký tự'),
    body('phone')
        .matches(/^[0-9]{10,11}$/)
        .withMessage('Số điện thoại không hợp lệ'),
    body('notes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Ghi chú không được quá 1000 ký tự'),
    body('promotion_code')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Mã khuyến mãi không hợp lệ'),
    body('payment_method')
        .optional()
        .isIn(['COD', 'BANK_TRANSFER', 'CREDIT_CARD'])
        .withMessage('Phương thức thanh toán không hợp lệ')
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array()
        });
    }
    next();
};

// Enhanced authentication middleware with better error messages
const enhancedAuth = (req, res, next) => {
    authenticateToken(req, res, (authError) => {
        if (authError) {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ hoặc đã hết hạn',
                error: 'TOKEN_INVALID'
            });
        }
        
        requireUser(req, res, (userError) => {
            if (userError) {
                return res.status(401).json({
                    success: false,
                    message: 'Yêu cầu đăng nhập',
                    error: 'LOGIN_REQUIRED'
                });
            }
            next();
        });
    });
};

// Apply authentication to all cart routes
router.use(enhancedAuth);

// Cart CRUD operations
router.get('/', cartController.getCart);

// FIXED: Add validation and better error handling for add to cart
router.post('/', 
    addToCartValidation, 
    handleValidationErrors, 
    cartController.addToCart
);

// FIXED: Update item by cart_id  
router.put('/:id', 
    updateQuantityValidation, 
    handleValidationErrors, 
    cartController.updateCartItem
);

// FIXED: Remove item by cart_id
router.delete('/:id', cartController.removeFromCart);

// FIXED: Remove item by product details (alternative endpoint)
router.delete('/', 
    removeByProductValidation,
    handleValidationErrors,
    cartController.removeFromCartByProduct
);

// Clear entire cart
router.post('/clear', cartController.clearCart);

// Cart utilities
router.get('/count', cartController.getCartCount);

// Sync cart from localStorage (when user logs in)
router.post('/sync', cartController.syncCart);

// Checkout
router.post('/checkout', 
    checkoutValidation, 
    handleValidationErrors, 
    cartController.checkout
);

// FIXED: Enhanced error handling middleware
router.use((error, req, res, next) => {
    console.error('Cart route error:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        user: req.user?.user_id
    });
    
    // Handle specific database errors
    if (error.code === 'EREQUEST') {
        return res.status(500).json({
            success: false,
            message: 'Lỗi cơ sở dữ liệu',
            error: 'DATABASE_ERROR'
        });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            error: 'VALIDATION_ERROR'
        });
    }
    
    // Handle SQL errors
    if (error.name === 'RequestError') {
        return res.status(500).json({
            success: false,
            message: 'Lỗi truy vấn cơ sở dữ liệu',
            error: 'SQL_ERROR'
        });
    }
    
    // Generic error
    res.status(500).json({
        success: false,
        message: 'Lỗi server không xác định',
        error: 'INTERNAL_SERVER_ERROR',
        details: error.message
    });
});

module.exports = router;