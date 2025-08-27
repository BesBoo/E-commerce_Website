const express = require('express');
const { body } = require('express-validator');
const { getPool, sql } = require('../config/db');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

const router = express.Router();

// =============================================================================
// CATEGORIES ROUTES
// =============================================================================

// Lấy tất cả danh mục
router.get('/categories', async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT c.*, COUNT(p.product_id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.category_id = p.category_id
            GROUP BY c.category_id, c.name, c.description, c.image_url, c.created_at
            ORDER BY c.name
        `);

        res.json({ categories: result.recordset });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Tạo danh mục mới (Admin only)
router.post('/categories', 
    authenticateToken, 
    requireAdmin, 
    [
        body('name').isLength({ min: 2, max: 100 }).withMessage('Tên danh mục phải từ 2-100 ký tự'),
        body('description').optional().isLength({ max: 255 }).withMessage('Mô tả không được quá 255 ký tự')
    ],
    async (req, res) => {
        try {
            const { name, description, image_url } = req.body;
            const pool = getPool();

            const result = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('description', sql.NVarChar, description)
                .input('image_url', sql.NVarChar, image_url)
                .query(`
                    INSERT INTO categories (name, description, image_url)
                    OUTPUT INSERTED.category_id
                    VALUES (@name, @description, @image_url)
                `);

            res.status(201).json({
                message: 'Tạo danh mục thành công',
                category_id: result.recordset[0].category_id
            });
        } catch (error) {
            console.error('Create category error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
);

// =============================================================================
// CART ROUTES
// =============================================================================

// Lấy giỏ hàng
router.get('/cart', authenticateToken, requireUser, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.user.user_id)
            .query(`
                SELECT 
                    c.cart_id, c.quantity, c.color, c.size,
                    p.product_id, p.name, p.price, p.image_url, p.stock,
                    p.discount_percent
                FROM cart c
                JOIN products p ON c.product_id = p.product_id
                WHERE c.user_id = @userId
                ORDER BY c.created_at DESC
            `);

        const cartItems = result.recordset.map(item => ({
            ...item,
            subtotal: item.price * item.quantity * (1 - item.discount_percent / 100)
        }));

        const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

        res.json({ 
            cart_items: cartItems,
            total_amount: total,
            item_count: cartItems.length
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Thêm sản phẩm vào giỏ hàng
router.post('/cart', 
    authenticateToken, 
    requireUser,
    [
        body('product_id').isInt({ min: 1 }).withMessage('ID sản phẩm không hợp lệ'),
        body('quantity').isInt({ min: 1 }).withMessage('Số lượng phải là số nguyên dương'),
        body('color').optional().isLength({ max: 50 }).withMessage('Màu sắc không hợp lệ'),
        body('size').optional().isLength({ max: 20 }).withMessage('Kích thước không hợp lệ')
    ],
    async (req, res) => {
        try {
            const { product_id, quantity, color, size } = req.body;
            const pool = getPool();

            // Kiểm tra sản phẩm tồn tại và còn hàng
            const productResult = await pool.request()
                .input('productId', sql.Int, product_id)
                .query('SELECT stock, name FROM products WHERE product_id = @productId');

            if (productResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
            }

            const product = productResult.recordset[0];
            if (product.stock < quantity) {
                return res.status(400).json({ 
                    message: `Sản phẩm ${product.name} không đủ hàng. Tồn kho: ${product.stock}` 
                });
            }

            // Kiểm tra sản phẩm đã có trong giỏ hàng chưa
            const existingResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, product_id)
                .input('color', sql.NVarChar, color || null)
                .input('size', sql.NVarChar, size || null)
                .query(`
                    SELECT cart_id, quantity FROM cart 
                    WHERE user_id = @userId AND product_id = @productId 
                    AND ISNULL(color, '') = ISNULL(@color, '')
                    AND ISNULL(size, '') = ISNULL(@size, '')
                `);

            if (existingResult.recordset.length > 0) {
                // Cập nhật số lượng
                const newQuantity = existingResult.recordset[0].quantity + quantity;
                if (newQuantity > product.stock) {
                    return res.status(400).json({ 
                        message: `Tổng số lượng vượt quá tồn kho. Tồn kho: ${product.stock}` 
                    });
                }

                await pool.request()
                    .input('cartId', sql.Int, existingResult.recordset[0].cart_id)
                    .input('newQuantity', sql.Int, newQuantity)
                    .query('UPDATE cart SET quantity = @newQuantity, updated_at = GETDATE() WHERE cart_id = @cartId');
            } else {
                // Thêm mới
                await pool.request()
                    .input('userId', sql.Int, req.user.user_id)
                    .input('productId', sql.Int, product_id)
                    .input('quantity', sql.Int, quantity)
                    .input('color', sql.NVarChar, color || null)
                    .input('size', sql.NVarChar, size || null)
                    .query(`
                        INSERT INTO cart (user_id, product_id, quantity, color, size)
                        VALUES (@userId, @productId, @quantity, @color, @size)
                    `);
            }

            res.json({ message: 'Thêm vào giỏ hàng thành công' });
        } catch (error) {
            console.error('Add to cart error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
);

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put('/cart/:cartId', authenticateToken, requireUser, async (req, res) => {
    try {
        const { cartId } = req.params;
        const { quantity } = req.body;

        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ message: 'Số lượng phải là số nguyên dương' });
        }

        const pool = getPool();

        // Kiểm tra cart item thuộc về user
        const cartResult = await pool.request()
            .input('cartId', sql.Int, cartId)
            .input('userId', sql.Int, req.user.user_id)
            .query(`
                SELECT c.product_id, p.stock, p.name
                FROM cart c
                JOIN products p ON c.product_id = p.product_id
                WHERE c.cart_id = @cartId AND c.user_id = @userId
            `);

        if (cartResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Sản phẩm không tồn tại trong giỏ hàng' });
        }

        const item = cartResult.recordset[0];
        if (quantity > item.stock) {
            return res.status(400).json({ 
                message: `Sản phẩm ${item.name} không đủ hàng. Tồn kho: ${item.stock}` 
            });
        }

        await pool.request()
            .input('cartId', sql.Int, cartId)
            .input('quantity', sql.Int, quantity)
            .query('UPDATE cart SET quantity = @quantity, updated_at = GETDATE() WHERE cart_id = @cartId');

        res.json({ message: 'Cập nhật giỏ hàng thành công' });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/cart/:cartId', authenticateToken, requireUser, async (req, res) => {
    try {
        const { cartId } = req.params;
        const pool = getPool();

        await pool.request()
            .input('cartId', sql.Int, cartId)
            .input('userId', sql.Int, req.user.user_id)
            .query('DELETE FROM cart WHERE cart_id = @cartId AND user_id = @userId');

        res.json({ message: 'Xóa sản phẩm khỏi giỏ hàng thành công' });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Xóa toàn bộ giỏ hàng
router.delete('/cart', authenticateToken, requireUser, async (req, res) => {
    try {
        const pool = getPool();
        await pool.request()
            .input('userId', sql.Int, req.user.user_id)
            .query('DELETE FROM cart WHERE user_id = @userId');

        res.json({ message: 'Xóa toàn bộ giỏ hàng thành công' });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// =============================================================================
// FAVORITES ROUTES
// =============================================================================

// Lấy danh sách yêu thích
router.get('/favorites', authenticateToken, requireUser, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.user.user_id)
            .query(`
                SELECT 
                    f.favorite_id, f.created_at,
                    p.product_id, p.name, p.price, p.image_url, p.discount_percent,
                    c.name as category_name,
                    AVG(CAST(r.rating as FLOAT)) as avg_rating
                FROM favorites f
                JOIN products p ON f.product_id = p.product_id
                LEFT JOIN categories c ON p.category_id = c.category_id
                LEFT JOIN reviews r ON p.product_id = r.product_id
                WHERE f.user_id = @userId
                GROUP BY f.favorite_id, f.created_at, p.product_id, p.name, 
                         p.price, p.image_url, p.discount_percent, c.name
                ORDER BY f.created_at DESC
            `);

        res.json({ favorites: result.recordset });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Thêm/xóa sản phẩm yêu thích
router.post('/favorites/:productId', authenticateToken, requireUser, async (req, res) => {
    try {
        const { productId } = req.params;
        const pool = getPool();

        // Kiểm tra sản phẩm tồn tại
        const productCheck = await pool.request()
            .input('productId', sql.Int, productId)
            .query('SELECT product_id FROM products WHERE product_id = @productId');

        if (productCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
        }

        // Kiểm tra đã yêu thích chưa
        const favoriteCheck = await pool.request()
            .input('userId', sql.Int, req.user.user_id)
            .input('productId', sql.Int, productId)
            .query('SELECT favorite_id FROM favorites WHERE user_id = @userId AND product_id = @productId');

        if (favoriteCheck.recordset.length > 0) {
            // Xóa khỏi yêu thích
            await pool.request()
                .input('favoriteId', sql.Int, favoriteCheck.recordset[0].favorite_id)
                .query('DELETE FROM favorites WHERE favorite_id = @favoriteId');
            
            res.json({ message: 'Đã xóa khỏi danh sách yêu thích', is_favorite: false });
        } else {
            // Thêm vào yêu thích
            await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, productId)
                .query('INSERT INTO favorites (user_id, product_id) VALUES (@userId, @productId)');
            
            res.json({ message: 'Đã thêm vào danh sách yêu thích', is_favorite: true });
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// =============================================================================
// PROMOTIONS ROUTES
// =============================================================================

// Lấy tất cả mã khuyến mãi đang hoạt động
router.get('/promotions', async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT code, discount_type, discount_value, min_order_amount, 
                   start_date, end_date, usage_limit, used_count
            FROM promotions
            WHERE is_active = 1
            AND (start_date IS NULL OR start_date <= GETDATE())
            AND (end_date IS NULL OR end_date >= GETDATE())
            AND (usage_limit IS NULL OR used_count < usage_limit)
            ORDER BY discount_value DESC
        `);

        res.json({ promotions: result.recordset });
    } catch (error) {
        console.error('Get promotions error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Kiểm tra mã khuyến mãi
router.post('/promotions/validate', authenticateToken, requireUser, async (req, res) => {
    try {
        const { code, order_amount } = req.body;

        if (!code || !order_amount) {
            return res.status(400).json({ message: 'Thiếu thông tin mã khuyến mãi hoặc giá trị đơn hàng' });
        }

        const pool = getPool();
        const result = await pool.request()
            .input('code', sql.NVarChar, code)
            .query(`
                SELECT discount_type, discount_value, min_order_amount, usage_limit, used_count
                FROM promotions
                WHERE code = @code AND is_active = 1
                AND (start_date IS NULL OR start_date <= GETDATE())
                AND (end_date IS NULL OR end_date >= GETDATE())
            `);

        if (result.recordset.length === 0) {
            return res.status(400).json({ message: 'Mã khuyến mãi không tồn tại hoặc đã hết hạn' });
        }

        const promotion = result.recordset[0];

        if (promotion.usage_limit && promotion.used_count >= promotion.usage_limit) {
            return res.status(400).json({ message: 'Mã khuyến mãi đã hết lượt sử dụng' });
        }

        if (order_amount < promotion.min_order_amount) {
            return res.status(400).json({ 
                message: `Đơn hàng tối thiểu ${promotion.min_order_amount.toLocaleString('vi-VN')}đ để sử dụng mã này` 
            });
        }

        let discount_amount = 0;
        if (promotion.discount_type === 'percent') {
            discount_amount = Math.floor(order_amount * promotion.discount_value / 100);
        } else {
            discount_amount = promotion.discount_value;
        }

        res.json({
            message: 'Mã khuyến mãi hợp lệ',
            discount_amount: discount_amount,
            final_amount: order_amount - discount_amount
        });
    } catch (error) {
        console.error('Validate promotion error:', error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
});

// Tạo mã khuyến mãi (Admin only)
router.post('/promotions', 
    authenticateToken, 
    requireAdmin,
    [
        body('code').isLength({ min: 3, max: 50 }).withMessage('Mã khuyến mãi phải từ 3-50 ký tự'),
        body('discount_value').isInt({ min: 1 }).withMessage('Giá trị giảm giá phải là số dương'),
        body('discount_type').isIn(['percent', 'fixed']).withMessage('Loại giảm giá không hợp lệ')
    ],
    async (req, res) => {
        try {
            const { 
                code, discount_type, discount_value, min_order_amount,
                start_date, end_date, usage_limit 
            } = req.body;

            const pool = getPool();
            
            // Kiểm tra mã đã tồn tại
            const existingCode = await pool.request()
                .input('code', sql.NVarChar, code)
                .query('SELECT code FROM promotions WHERE code = @code');

            if (existingCode.recordset.length > 0) {
                return res.status(400).json({ message: 'Mã khuyến mãi đã tồn tại' });
            }

            await pool.request()
                .input('code', sql.NVarChar, code)
                .input('discount_type', sql.NVarChar, discount_type)
                .input('discount_value', sql.Int, discount_value)
                .input('min_order_amount', sql.Decimal(18,2), min_order_amount || 0)
                .input('start_date', sql.DateTime, start_date || null)
                .input('end_date', sql.DateTime, end_date || null)
                .input('usage_limit', sql.Int, usage_limit || null)
                .query(`
                    INSERT INTO promotions (code, discount_type, discount_value, min_order_amount, 
                                          start_date, end_date, usage_limit)
                    VALUES (@code, @discount_type, @discount_value, @min_order_amount,
                           @start_date, @end_date, @usage_limit)
                `);

            res.status(201).json({ message: 'Tạo mã khuyến mãi thành công' });
        } catch (error) {
            console.error('Create promotion error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
);

module.exports = router;