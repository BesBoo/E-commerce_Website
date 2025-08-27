// server/controllers/cartController.js - FIXED VERSION 2

const { getPool, sql } = require('../config/db');

const cartController = {
    // Lấy giỏ hàng của user
    getCart: async (req, res) => {
        try {
            const pool = getPool();
            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT 
                        c.cart_id, c.quantity, c.color, c.size, c.created_at,
                        p.product_id, p.name, p.price, p.image_url, p.stock,
                        p.discount_percent, p.brand, cat.name as category_name
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    LEFT JOIN categories cat ON p.category_id = cat.category_id
                    WHERE c.user_id = @userId
                    ORDER BY c.created_at DESC
                `);

            const items = result.recordset.map(item => ({
                cart_id: item.cart_id,
                product_id: item.product_id,
                name: item.name,
                price: item.price,
                image_url: item.image_url,
                color: item.color,
                size: item.size,
                quantity: item.quantity,
                stock: item.stock,
                discount_percent: item.discount_percent || 0,
                brand: item.brand,
                category_name: item.category_name
            }));

            // Tính tổng tiền
            let subtotal = 0;
            items.forEach(item => {
                const finalPrice = item.price * (1 - (item.discount_percent || 0) / 100);
                subtotal += finalPrice * item.quantity;
            });

            res.json({
                items: items,
                subtotal: subtotal,
                total_items: items.reduce((total, item) => total + item.quantity, 0)
            });
        } catch (error) {
            console.error('Get cart error:', error);
            res.status(500).json({ 
                message: 'Không thể tải giỏ hàng', 
                error: error.message,
                code: 'GET_CART_ERROR'
            });
        }
    },

    // Thêm sản phẩm vào giỏ hàng với enhanced error handling
    addToCart: async (req, res) => {
        let pool;
        try {
            // Log the incoming request
            console.log('Add to cart request:', {
                body: req.body,
                user: req.user?.user_id
            });

            // Validate user
            if (!req.user?.user_id) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Get database pool
            pool = getPool();
            if (!pool) {
                throw new Error('Database connection failed');
            }

            const { product_id, quantity = 1, color, size } = req.body;

            // Validate product_id
            if (!product_id || isNaN(product_id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID sản phẩm không hợp lệ'
                });
            }

            const productId = parseInt(product_id);
            const normalizedQuantity = Math.min(Math.max(parseInt(quantity) || 1, 1), 99);

            // Normalize color and size
            const normalizedColor = color && color.toString().trim() !== '' && color !== 'null' ? color.toString().trim() : null;
            const normalizedSize = size && size.toString().trim() !== '' && size !== 'null' ? size.toString().trim() : null;

            console.log('Normalized data:', { productId, normalizedQuantity, normalizedColor, normalizedSize });

            // Check if product exists - FIXED: Không sử dụng is_active nếu cột không tồn tại
            const productResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT product_id, name, price, stock
                    FROM products 
                    WHERE product_id = @productId
                `);

            if (productResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sản phẩm không tồn tại'
                });
            }

            const product = productResult.recordset[0];
            console.log('Product found:', product);

            // Check stock
            if (normalizedQuantity > product.stock) {
                return res.status(400).json({
                    success: false,
                    message: `Số lượng vượt quá tồn kho (còn ${product.stock})`
                });
            }

            // Check if product already exists in cart with same color/size
            const existingCartResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId2', sql.Int, productId)
                .input('color', sql.NVarChar(50), normalizedColor)
                .input('size', sql.NVarChar(50), normalizedSize)
                .query(`
                    SELECT cart_id, quantity 
                    FROM cart 
                    WHERE user_id = @userId 
                    AND product_id = @productId2
                    AND (
                        (color IS NULL AND @color IS NULL) OR 
                        (color = @color)
                    )
                    AND (
                        (size IS NULL AND @size IS NULL) OR 
                        (size = @size)
                    )
                `);

            if (existingCartResult.recordset.length > 0) {
                // Update existing cart item
                const existingItem = existingCartResult.recordset[0];
                const newQuantity = existingItem.quantity + normalizedQuantity;
                
                // Check stock for updated quantity
                if (newQuantity > product.stock) {
                    return res.status(400).json({
                        success: false,
                        message: `Tổng số lượng sẽ vượt quá tồn kho (còn ${product.stock})`
                    });
                }

                await pool.request()
                    .input('cartId', sql.Int, existingItem.cart_id)
                    .input('newQuantity', sql.Int, newQuantity)
                    .query(`
                        UPDATE cart 
                        SET quantity = @newQuantity, 
                            updated_at = GETDATE() 
                        WHERE cart_id = @cartId
                    `);

                console.log('Updated existing cart item');
            } else {
                // Add new item to cart
                await pool.request()
                    .input('userId2', sql.Int, req.user.user_id)
                    .input('productId3', sql.Int, productId)
                    .input('quantity', sql.Int, normalizedQuantity)
                    .input('color2', sql.NVarChar(50), normalizedColor)
                    .input('size2', sql.NVarChar(50), normalizedSize)
                    .query(`
                        INSERT INTO cart (user_id, product_id, quantity, color, size, created_at, updated_at)
                        VALUES (@userId2, @productId3, @quantity, @color2, @size2, GETDATE(), GETDATE())
                    `);

                console.log('Added new cart item');
            }

            return res.status(201).json({
                success: true,
                message: 'Đã thêm sản phẩm vào giỏ hàng'
            });

        } catch (error) {
            console.error('Add to cart error:', error);
            console.error('Error stack:', error.stack);
            
            // Provide more specific error messages
            let errorMessage = 'Lỗi khi thêm vào giỏ hàng';
            
            if (error.message.includes('connection')) {
                errorMessage = 'Lỗi kết nối cơ sở dữ liệu';
            } else if (error.message.includes('Invalid column name')) {
                errorMessage = 'Lỗi cấu trúc cơ sở dữ liệu - Vui lòng liên hệ quản trị viên';
            } else if (error.message.includes('constraint')) {
                errorMessage = 'Lỗi ràng buộc dữ liệu';
            }
            
            res.status(500).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    },

    // Cập nhật số lượng sản phẩm trong giỏ
    updateCartItem: async (req, res) => {
        try {
            const { id } = req.params; // cart_id
            const { quantity } = req.body;

            if (!id || isNaN(id)) {
                return res.status(400).json({ 
                    message: 'ID giỏ hàng không hợp lệ',
                    code: 'INVALID_CART_ID'
                });
            }

            if (quantity <= 0) {
                // If quantity is 0 or less, remove the item
                return await this.removeFromCart(req, res);
            }

            const pool = getPool();

            // Kiểm tra cart item thuộc về user - FIXED: Không sử dụng is_active
            const cartResult = await pool.request()
                .input('cartId', sql.Int, parseInt(id))
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT c.*, p.name, p.stock
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    WHERE c.cart_id = @cartId AND c.user_id = @userId
                `);

            if (cartResult.recordset.length === 0) {
                return res.status(404).json({ 
                    message: 'Sản phẩm không tồn tại trong giỏ hàng của bạn',
                    code: 'CART_ITEM_NOT_FOUND'
                });
            }

            const cartItem = cartResult.recordset[0];

            if (quantity > cartItem.stock) {
                return res.status(400).json({ 
                    message: `Số lượng vượt quá tồn kho. Tồn kho: ${cartItem.stock}`,
                    code: 'INSUFFICIENT_STOCK',
                    available_stock: cartItem.stock
                });
            }

            // Cập nhật số lượng
            await pool.request()
                .input('cartId', sql.Int, parseInt(id))
                .input('quantity', sql.Int, parseInt(quantity))
                .query('UPDATE cart SET quantity = @quantity, updated_at = GETDATE() WHERE cart_id = @cartId');

            res.json({ 
                message: `Đã cập nhật số lượng "${cartItem.name}" thành công`,
                product_name: cartItem.name,
                new_quantity: parseInt(quantity)
            });
        } catch (error) {
            console.error('Update cart item error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi cập nhật sản phẩm',
                error: error.message,
                code: 'UPDATE_CART_ERROR'
            });
        }
    },

    // Xóa sản phẩm khỏi giỏ hàng by cart_id
    removeFromCart: async (req, res) => {
        try {
            const { id } = req.params; // cart_id
            const pool = getPool();

            if (!id || isNaN(id)) {
                return res.status(400).json({ 
                    message: 'ID không hợp lệ',
                    code: 'INVALID_ID'
                });
            }

            // Get product name before deletion for response message
            const cartResult = await pool.request()
                .input('cartId', sql.Int, parseInt(id))
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT c.cart_id, p.name 
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    WHERE c.cart_id = @cartId AND c.user_id = @userId
                `);

            if (cartResult.recordset.length === 0) {
                return res.status(404).json({ 
                    message: 'Sản phẩm không tồn tại trong giỏ hàng của bạn',
                    code: 'CART_ITEM_NOT_FOUND'
                });
            }

            const productName = cartResult.recordset[0].name;

            // Delete the cart item
            const deleteResult = await pool.request()
                .input('cartId', sql.Int, parseInt(id))
                .input('userId', sql.Int, req.user.user_id)
                .query('DELETE FROM cart WHERE cart_id = @cartId AND user_id = @userId');

            if (deleteResult.rowsAffected[0] === 0) {
                return res.status(404).json({ 
                    message: 'Không thể xóa sản phẩm khỏi giỏ hàng',
                    code: 'DELETE_FAILED'
                });
            }

            res.json({ 
                message: `Đã xóa "${productName}" khỏi giỏ hàng`,
                product_name: productName
            });
        } catch (error) {
            console.error('Remove from cart error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi xóa sản phẩm',
                error: error.message,
                code: 'REMOVE_FROM_CART_ERROR'
            });
        }
    },

    // Xóa sản phẩm khỏi giỏ hàng by product details (alternative method)
    removeFromCartByProduct: async (req, res) => {
        try {
            const { product_id, color, size } = req.body;
            const pool = getPool();

            if (!product_id || isNaN(product_id)) {
                return res.status(400).json({ 
                    message: 'ID sản phẩm không hợp lệ',
                    code: 'INVALID_PRODUCT_ID'
                });
            }

            // Chuẩn hóa color và size
            const normalizedColor = color && color.trim() !== '' && color !== 'null' ? color.trim() : null;
            const normalizedSize = size && size.trim() !== '' && size !== 'null' ? size.trim() : null;

            // Get product name before deletion
            const cartResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, parseInt(product_id))
                .input('color', sql.NVarChar(50), normalizedColor)
                .input('size', sql.NVarChar(50), normalizedSize)
                .query(`
                    SELECT c.cart_id, p.name 
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    WHERE c.user_id = @userId AND c.product_id = @productId 
                    AND (
                        (c.color IS NULL AND @color IS NULL) OR 
                        (c.color = @color)
                    )
                    AND (
                        (c.size IS NULL AND @size IS NULL) OR 
                        (c.size = @size)
                    )
                `);

            if (cartResult.recordset.length === 0) {
                return res.status(404).json({ 
                    message: 'Sản phẩm không tồn tại trong giỏ hàng',
                    code: 'CART_ITEM_NOT_FOUND'
                });
            }

            const productName = cartResult.recordset[0].name;

            // Delete the cart item
            const deleteResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, parseInt(product_id))
                .input('color', sql.NVarChar(50), normalizedColor)
                .input('size', sql.NVarChar(50), normalizedSize)
                .query(`
                    DELETE FROM cart 
                    WHERE user_id = @userId AND product_id = @productId 
                    AND (
                        (color IS NULL AND @color IS NULL) OR 
                        (color = @color)
                    )
                    AND (
                        (size IS NULL AND @size IS NULL) OR 
                        (size = @size)
                    )
                `);

            if (deleteResult.rowsAffected[0] === 0) {
                return res.status(404).json({ 
                    message: 'Không thể xóa sản phẩm khỏi giỏ hàng',
                    code: 'DELETE_FAILED'
                });
            }

            res.json({ 
                message: `Đã xóa "${productName}" khỏi giỏ hàng`,
                product_name: productName
            });
        } catch (error) {
            console.error('Remove from cart by product error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi xóa sản phẩm',
                error: error.message,
                code: 'REMOVE_BY_PRODUCT_ERROR'
            });
        }
    },

    // Xóa tất cả sản phẩm trong giỏ hàng
    clearCart: async (req, res) => {
        try {
            const pool = getPool();
            
            // Get count before clearing
            const countResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query('SELECT COUNT(*) as item_count FROM cart WHERE user_id = @userId');
            
            const itemCount = countResult.recordset[0].item_count;

            if (itemCount === 0) {
                return res.json({ 
                    message: 'Giỏ hàng đã trống',
                    items_removed: 0
                });
            }

            // Clear the cart
            const deleteResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query('DELETE FROM cart WHERE user_id = @userId');

            res.json({ 
                message: 'Đã xóa tất cả sản phẩm khỏi giỏ hàng',
                items_removed: deleteResult.rowsAffected[0] || 0
            });
        } catch (error) {
            console.error('Clear cart error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi xóa giỏ hàng',
                error: error.message,
                code: 'CLEAR_CART_ERROR'
            });
        }
    },

    // Lấy số lượng sản phẩm trong giỏ (cho header)
    getCartCount: async (req, res) => {
        try {
            const pool = getPool();
            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query('SELECT SUM(quantity) as total_items FROM cart WHERE user_id = @userId');

            const totalItems = result.recordset[0].total_items || 0;
            res.json({ total_items: totalItems });
        } catch (error) {
            console.error('Get cart count error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi đếm sản phẩm',
                error: error.message,
                code: 'GET_CART_COUNT_ERROR',
                total_items: 0
            });
        }
    },

    // Đồng bộ giỏ hàng từ localStorage (khi user đăng nhập)
    syncCart: async (req, res) => {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        
        try {
            await transaction.begin();
            const request = new sql.Request(transaction);

            const { items } = req.body;

            if (!items || !Array.isArray(items)) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: 'Dữ liệu giỏ hàng không hợp lệ',
                    code: 'INVALID_CART_DATA'
                });
            }

            console.log('Syncing cart items:', items.length);

            let syncedCount = 0;
            let errorCount = 0;

            // Thêm từng sản phẩm từ localStorage
            for (const item of items) {
                try {
                    // Validate item data
                    if (!item.product_id && !item.productId) {
                        console.error('Invalid item - no product ID:', item);
                        errorCount++;
                        continue;
                    }

                    const productId = item.product_id || item.productId;
                    const quantity = Math.max(1, parseInt(item.quantity) || 1);

                    // Kiểm tra sản phẩm tồn tại và còn hàng - FIXED: Không sử dụng is_active
                    const productResult = await request
                        .input('productId', sql.Int, parseInt(productId))
                        .query('SELECT name, stock FROM products WHERE product_id = @productId');

                    if (productResult.recordset.length === 0) {
                        console.error('Product not found:', productId);
                        errorCount++;
                        continue;
                    }

                    const product = productResult.recordset[0];
                    const finalQuantity = Math.min(quantity, product.stock);

                    if (finalQuantity > 0) {
                        // Chuẩn hóa color và size
                        const normalizedColor = item.color && item.color.trim() !== '' && item.color !== 'null' ? item.color.trim() : null;
                        const normalizedSize = item.size && item.size.trim() !== '' && item.size !== 'null' ? item.size.trim() : null;

                        // Check if item already exists in server cart
                        const existingResult = await request
                            .input('userId', sql.Int, req.user.user_id)
                            .input('productId2', sql.Int, parseInt(productId))
                            .input('color', sql.NVarChar(50), normalizedColor)
                            .input('size', sql.NVarChar(50), normalizedSize)
                            .query(`
                                SELECT cart_id, quantity FROM cart 
                                WHERE user_id = @userId AND product_id = @productId2 
                                AND (
                                    (color IS NULL AND @color IS NULL) OR 
                                    (color = @color)
                                )
                                AND (
                                    (size IS NULL AND @size IS NULL) OR 
                                    (size = @size)
                                )
                            `);

                        if (existingResult.recordset.length > 0) {
                            // Update existing item
                            const existingItem = existingResult.recordset[0];
                            const newQuantity = Math.min(existingItem.quantity + finalQuantity, product.stock);

                            await request
                                .input('cartId', sql.Int, existingItem.cart_id)
                                .input('newQuantity', sql.Int, newQuantity)
                                .query('UPDATE cart SET quantity = @newQuantity, updated_at = GETDATE() WHERE cart_id = @cartId');
                        } else {
                            // Insert new item
                            await request
                                .input('userId2', sql.Int, req.user.user_id)
                                .input('productId3', sql.Int, parseInt(productId))
                                .input('quantity', sql.Int, finalQuantity)
                                .input('color2', sql.NVarChar(50), normalizedColor)
                                .input('size2', sql.NVarChar(50), normalizedSize)
                                .query(`
                                    INSERT INTO cart (user_id, product_id, quantity, color, size, created_at, updated_at)
                                    VALUES (@userId2, @productId3, @quantity, @color2, @size2, GETDATE(), GETDATE())
                                `);
                        }

                        syncedCount++;
                    } else {
                        errorCount++;
                    }
                } catch (itemError) {
                    console.error('Error syncing individual item:', itemError);
                    errorCount++;
                }
            }

            await transaction.commit();

            // Trả về giỏ hàng đã đồng bộ
            const syncedCart = await this.getCartData(req.user.user_id);
            
            res.json({
                message: `Đã đồng bộ giỏ hàng thành công`,
                synced_items: syncedCount,
                error_items: errorCount,
                total_items: syncedCart.total_items,
                ...syncedCart
            });
        } catch (error) {
            await transaction.rollback();
            console.error('Sync cart error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi đồng bộ giỏ hàng',
                error: error.message,
                code: 'SYNC_CART_ERROR'
            });
        }
    },

    // Helper function để lấy dữ liệu giỏ hàng
    async getCartData(userId) {
        try {
            const pool = getPool();
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT 
                        c.cart_id, c.quantity, c.color, c.size,
                        p.product_id, p.name, p.price, p.image_url, p.stock,
                        p.discount_percent, p.brand
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    WHERE c.user_id = @userId
                    ORDER BY c.created_at DESC
                `);

            const items = result.recordset.map(item => ({
                cart_id: item.cart_id,
                product_id: item.product_id,
                name: item.name,
                price: item.price,
                image_url: item.image_url,
                color: item.color,
                size: item.size,
                quantity: item.quantity,
                stock: item.stock,
                discount_percent: item.discount_percent || 0,
                brand: item.brand
            }));

            let subtotal = 0;
            items.forEach(item => {
                const finalPrice = item.price * (1 - (item.discount_percent || 0) / 100);
                subtotal += finalPrice * item.quantity;
            });

            return {
                items: items,
                subtotal: subtotal,
                total_items: items.reduce((total, item) => total + item.quantity, 0)
            };
        } catch (error) {
            throw error;
        }
    },

    // Checkout - Tạo đơn hàng từ giỏ hàng
    checkout: async (req, res) => {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        
        try {
            await transaction.begin();
            const request = new sql.Request(transaction);

            const { 
                shipping_address, 
                phone, 
                notes, 
                promotion_code,
                payment_method = 'COD'
            } = req.body;

            // Validate required fields
            if (!shipping_address || !phone) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: 'Địa chỉ giao hàng và số điện thoại là bắt buộc',
                    code: 'MISSING_REQUIRED_FIELDS'
                });
            }

            // Lấy sản phẩm trong giỏ hàng - FIXED: Không sử dụng is_active
            const cartResult = await request
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT 
                        c.cart_id, c.product_id, c.quantity, c.color, c.size,
                        p.name, p.price, p.stock, p.discount_percent
                    FROM cart c
                    JOIN products p ON c.product_id = p.product_id
                    WHERE c.user_id = @userId
                `);

            if (cartResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: 'Giỏ hàng trống',
                    code: 'EMPTY_CART'
                });
            }

            const cartItems = cartResult.recordset;
            let total_amount = 0;
            const unavailableItems = [];

            // Kiểm tra tồn kho và tính tổng tiền
            for (const item of cartItems) {
                if (item.stock < item.quantity) {
                    unavailableItems.push(`${item.name} - Không đủ hàng (còn ${item.stock})`);
                    continue;
                }

                const finalPrice = item.price * (1 - (item.discount_percent || 0) / 100);
                total_amount += finalPrice * item.quantity;
            }

            if (unavailableItems.length > 0) {
                await transaction.rollback();
                return res.status(400).json({ 
                    message: 'Một số sản phẩm trong giỏ hàng không khả dụng',
                    code: 'UNAVAILABLE_ITEMS',
                    unavailable_items: unavailableItems
                });
            }

            // Áp dụng mã khuyến mãi nếu có
            let promotion_discount = 0;
            if (promotion_code) {
                const promotionResult = await request
                    .input('code', sql.NVarChar(50), promotion_code)
                    .query(`
                        SELECT discount_type, discount_value, min_order_amount, usage_limit, used_count
                        FROM promotions
                        WHERE code = @code AND is_active = 1
                        AND (start_date IS NULL OR start_date <= GETDATE())
                        AND (end_date IS NULL OR end_date >= GETDATE())
                    `);

                if (promotionResult.recordset.length > 0) {
                    const promotion = promotionResult.recordset[0];
                    
                    if (promotion.usage_limit && promotion.used_count >= promotion.usage_limit) {
                        await transaction.rollback();
                        return res.status(400).json({ 
                            message: 'Mã khuyến mãi đã hết lượt sử dụng',
                            code: 'PROMOTION_EXHAUSTED'
                        });
                    }

                    if (total_amount >= promotion.min_order_amount) {
                        if (promotion.discount_type === 'percent') {
                            promotion_discount = Math.floor(total_amount * promotion.discount_value / 100);
                        } else {
                            promotion_discount = promotion.discount_value;
                        }
                        
                        total_amount -= promotion_discount;
                        
                        // Cập nhật số lần sử dụng
                        await request
                            .input('code2', sql.NVarChar(50), promotion_code)
                            .query('UPDATE promotions SET used_count = used_count + 1 WHERE code = @code2');
                    }
                } else {
                    await transaction.rollback();
                    return res.status(400).json({ 
                        message: 'Mã khuyến mãi không hợp lệ hoặc đã hết hạn',
                        code: 'INVALID_PROMOTION'
                    });
                }
            }

            // Tạo đơn hàng
            const orderResult = await request
                .input('userId2', sql.Int, req.user.user_id)
                .input('total_amount', sql.Decimal(18,2), total_amount)
                .input('shipping_address', sql.NVarChar(500), shipping_address)
                .input('phone', sql.NVarChar(20), phone)
                .input('notes', sql.NVarChar(500), notes)
                .input('payment_method', sql.NVarChar(50), payment_method)
                .query(`
                    INSERT INTO orders (user_id, total_amount, shipping_address, phone, notes, payment_method, created_at)
                    OUTPUT INSERTED.order_id
                    VALUES (@userId2, @total_amount, @shipping_address, @phone, @notes, @payment_method, GETDATE())
                `);

            const order_id = orderResult.recordset[0].order_id;

            // Thêm chi tiết đơn hàng và cập nhật tồn kho
            for (const item of cartItems) {
                const finalPrice = item.price * (1 - (item.discount_percent || 0) / 100);
                
                // Thêm chi tiết đơn hàng
                await request
                    .input('orderId', sql.Int, order_id)
                    .input('productId', sql.Int, item.product_id)
                    .input('quantity', sql.Int, item.quantity)
                    .input('price', sql.Decimal(18,2), finalPrice)
                    .input('color', sql.NVarChar(50), item.color)
                    .input('size', sql.NVarChar(50), item.size)
                    .query(`
                        INSERT INTO order_details (order_id, product_id, quantity, price, color, size, created_at)
                        VALUES (@orderId, @productId, @quantity, @price, @color, @size, GETDATE())
                    `);

                // Cập nhật tồn kho
                await request
                    .input('productId2', sql.Int, item.product_id)
                    .input('quantity2', sql.Int, item.quantity)
                    .query('UPDATE products SET stock = stock - @quantity2 WHERE product_id = @productId2');
            }

            // Xóa giỏ hàng sau khi đặt hàng thành công
            await request
                .input('userId3', sql.Int, req.user.user_id)
                .query('DELETE FROM cart WHERE user_id = @userId3');

            await transaction.commit();

            res.status(201).json({
                message: 'Đặt hàng thành công',
                order_id: order_id,
                total_amount: total_amount,
                promotion_discount: promotion_discount,
                items_count: cartItems.length
            });
        } catch (error) {
            await transaction.rollback();
            console.error('Checkout error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi đặt hàng',
                error: error.message,
                code: 'CHECKOUT_ERROR'
            });
        }
    }
};

module.exports = cartController;