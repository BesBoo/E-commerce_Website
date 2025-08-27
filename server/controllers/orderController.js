// server/controller/orderController.js

const { getPool, sql } = require('../config/db');

const orderController = {
    // Tạo đơn hàng mới
    createOrder: async (req, res) => {
        const transaction = new sql.Transaction(getPool());
        
        try {
            await transaction.begin();
            const request = new sql.Request(transaction);

            const { items, shipping_address, phone, notes, promotion_code } = req.body;
            
            if (!items || items.length === 0) {
                await transaction.rollback();
                return res.status(400).json({ message: 'Giỏ hàng trống' });
            }

            let total_amount = 0;
            let promotion_discount = 0;

            // Kiểm tra mã khuyến mãi nếu có
            if (promotion_code) {
                const promotionResult = await request
                    .input('code', sql.NVarChar, promotion_code)
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
                        return res.status(400).json({ message: 'Mã khuyến mãi đã hết lượt sử dụng' });
                    }
                }
            }

            // Tính tổng tiền và kiểm tra tồn kho
            for (const item of items) {
                const productResult = await request
                    .input('productId', sql.Int, item.product_id)
                    .query('SELECT price, stock, name FROM products WHERE product_id = @productId');

                if (productResult.recordset.length === 0) {
                    await transaction.rollback();
                    return res.status(400).json({ message: `Sản phẩm ID ${item.product_id} không tồn tại` });
                }

                const product = productResult.recordset[0];
                
                if (product.stock < item.quantity) {
                    await transaction.rollback();
                    return res.status(400).json({ 
                        message: `Sản phẩm ${product.name} không đủ hàng. Tồn kho: ${product.stock}` 
                    });
                }

                total_amount += product.price * item.quantity;
            }

            // Áp dụng mã khuyến mãi
            if (promotion_code) {
                const promotionResult = await request
                    .input('code2', sql.NVarChar, promotion_code)
                    .query(`
                        SELECT discount_type, discount_value, min_order_amount
                        FROM promotions
                        WHERE code = @code2 AND is_active = 1
                        AND (start_date IS NULL OR start_date <= GETDATE())
                        AND (end_date IS NULL OR end_date >= GETDATE())
                    `);

                if (promotionResult.recordset.length > 0) {
                    const promotion = promotionResult.recordset[0];
                    
                    if (total_amount >= promotion.min_order_amount) {
                        if (promotion.discount_type === 'percent') {
                            promotion_discount = Math.floor(total_amount * promotion.discount_value / 100);
                        } else {
                            promotion_discount = promotion.discount_value;
                        }
                        
                        total_amount -= promotion_discount;
                        
                        // Cập nhật số lần sử dụng
                        await request
                            .input('code3', sql.NVarChar, promotion_code)
                            .query('UPDATE promotions SET used_count = used_count + 1 WHERE code = @code3');
                    }
                }
            }

            // Tạo đơn hàng
            const orderResult = await request
                .input('userId', sql.Int, req.user.user_id)
                .input('total_amount', sql.Decimal(18,2), total_amount)
                .input('shipping_address', sql.NVarChar, shipping_address)
                .input('phone', sql.NVarChar, phone)
                .input('notes', sql.NVarChar, notes)
                .query(`
                    INSERT INTO orders (user_id, total_amount, shipping_address, phone, notes)
                    OUTPUT INSERTED.order_id
                    VALUES (@userId, @total_amount, @shipping_address, @phone, @notes)
                `);

            const order_id = orderResult.recordset[0].order_id;

            // Thêm chi tiết đơn hàng và cập nhật tồn kho
            for (const item of items) {
                const productResult = await request
                    .input('productId2', sql.Int, item.product_id)
                    .query('SELECT price FROM products WHERE product_id = @productId2');

                const product = productResult.recordset[0];

                // Thêm chi tiết đơn hàng
                await request
                    .input('orderId', sql.Int, order_id)
                    .input('productId3', sql.Int, item.product_id)
                    .input('quantity', sql.Int, item.quantity)
                    .input('price', sql.Decimal(18,2), product.price)
                    .input('color', sql.NVarChar, item.color || null)
                    .input('size', sql.NVarChar, item.size || null)
                    .query(`
                        INSERT INTO order_details (order_id, product_id, quantity, price, color, size)
                        VALUES (@orderId, @productId3, @quantity, @price, @color, @size)
                    `);

                // Cập nhật tồn kho
                await request
                    .input('productId4', sql.Int, item.product_id)
                    .input('quantity2', sql.Int, item.quantity)
                    .query('UPDATE products SET stock = stock - @quantity2 WHERE product_id = @productId4');

                // Xóa sản phẩm khỏi giỏ hàng
                await request
                    .input('userId2', sql.Int, req.user.user_id)
                    .input('productId5', sql.Int, item.product_id)
                    .query('DELETE FROM cart WHERE user_id = @userId2 AND product_id = @productId5');
            }

            await transaction.commit();

            res.status(201).json({
                message: 'Đặt hàng thành công',
                order_id: order_id,
                total_amount: total_amount,
                promotion_discount: promotion_discount
            });
        } catch (error) {
            await transaction.rollback();
            console.error('Create order error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Lấy đơn hàng của user
    getUserOrders: async (req, res) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;
            const pool = getPool();

            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, parseInt(limit))
                .query(`
                    SELECT 
                        o.order_id, o.total_amount, o.status, o.created_at,
                        o.shipping_address, o.phone, o.notes,
                        COUNT(od.order_detail_id) as item_count
                    FROM orders o
                    LEFT JOIN order_details od ON o.order_id = od.order_id
                    WHERE o.user_id = @userId
                    GROUP BY o.order_id, o.total_amount, o.status, o.created_at,
                             o.shipping_address, o.phone, o.notes
                    ORDER BY o.created_at DESC
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `);

            // Đếm tổng số đơn hàng
            const countResult = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query('SELECT COUNT(*) as total FROM orders WHERE user_id = @userId');

            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / limit);

            res.json({
                orders: result.recordset,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: totalPages,
                    total_items: total,
                    items_per_page: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Get user orders error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Lấy chi tiết đơn hàng
    getOrderById: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = getPool();

            // Lấy thông tin đơn hàng
            const orderResult = await pool.request()
                .input('orderId', sql.Int, id)
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT o.*, u.username, u.email, u.full_name
                    FROM orders o
                    JOIN users u ON o.user_id = u.user_id
                    WHERE o.order_id = @orderId 
                    ${req.user.role !== 'admin' ? 'AND o.user_id = @userId' : ''}
                `);

            if (orderResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
            }

            // Lấy chi tiết sản phẩm trong đơn hàng
            const detailsResult = await pool.request()
                .input('orderId', sql.Int, id)
                .query(`
                    SELECT 
                        od.*, p.name, p.image_url, p.brand
                    FROM order_details od
                    JOIN products p ON od.product_id = p.product_id
                    WHERE od.order_id = @orderId
                `);

            const order = orderResult.recordset[0];
            order.items = detailsResult.recordset;

            res.json({ order });
        } catch (error) {
            console.error('Get order by id error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Hủy đơn hàng (chỉ khi status = 'pending')
    cancelOrder: async (req, res) => {
        const transaction = new sql.Transaction(getPool());
        
        try {
            await transaction.begin();
            const request = new sql.Request(transaction);

            const { id } = req.params;

            // Kiểm tra đơn hàng
            const orderResult = await request
                .input('orderId', sql.Int, id)
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT status FROM orders 
                    WHERE order_id = @orderId AND user_id = @userId
                `);

            if (orderResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
            }

            const order = orderResult.recordset[0];
            if (order.status !== 'pending') {
                await transaction.rollback();
                return res.status(400).json({ message: 'Không thể hủy đơn hàng này' });
            }

            // Hoàn trả tồn kho
            const itemsResult = await request
                .input('orderId2', sql.Int, id)
                .query('SELECT product_id, quantity FROM order_details WHERE order_id = @orderId2');

            for (const item of itemsResult.recordset) {
                await request
                    .input('productId', sql.Int, item.product_id)
                    .input('quantity', sql.Int, item.quantity)
                    .query('UPDATE products SET stock = stock + @quantity WHERE product_id = @productId');
            }

            // Cập nhật trạng thái đơn hàng
            await request
                .input('orderId3', sql.Int, id)
                .query("UPDATE orders SET status = 'cancelled', updated_at = GETDATE() WHERE order_id = @orderId3");

            await transaction.commit();
            res.json({ message: 'Hủy đơn hàng thành công' });
        } catch (error) {
            await transaction.rollback();
            console.error('Cancel order error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Lấy tất cả đơn hàng (Admin only)
    getAllOrders: async (req, res) => {
        try {
            const { 
                page = 1, 
                limit = 20, 
                status, 
                user_id,
                from_date,
                to_date
            } = req.query;

            const offset = (page - 1) * limit;
            const pool = getPool();

            let whereConditions = ['1=1'];
            let queryParams = [];

            // Lọc theo trạng thái
            if (status) {
                whereConditions.push('o.status = @status');
                queryParams.push({ name: 'status', type: sql.NVarChar, value: status });
            }

            // Lọc theo user
            if (user_id) {
                whereConditions.push('o.user_id = @user_id');
                queryParams.push({ name: 'user_id', type: sql.Int, value: parseInt(user_id) });
            }

            // Lọc theo ngày
            if (from_date) {
                whereConditions.push('o.created_at >= @from_date');
                queryParams.push({ name: 'from_date', type: sql.DateTime, value: new Date(from_date) });
            }
            if (to_date) {
                whereConditions.push('o.created_at <= @to_date');
                queryParams.push({ name: 'to_date', type: sql.DateTime, value: new Date(to_date) });
            }

            const whereClause = whereConditions.join(' AND ');

            let request = pool.request()
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, parseInt(limit));

            // Add dynamic parameters
            queryParams.forEach(param => {
                request = request.input(param.name, param.type, param.value);
            });

            const result = await request.query(`
                SELECT 
                    o.order_id, o.total_amount, o.status, o.created_at,
                    o.shipping_address, o.phone,
                    u.username, u.full_name, u.email,
                    COUNT(od.order_detail_id) as item_count
                FROM orders o
                JOIN users u ON o.user_id = u.user_id
                LEFT JOIN order_details od ON o.order_id = od.order_id
                WHERE ${whereClause}
                GROUP BY o.order_id, o.total_amount, o.status, o.created_at,
                         o.shipping_address, o.phone, u.username, u.full_name, u.email
                ORDER BY o.created_at DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            `);

            // Đếm tổng số đơn hàng
            let countRequest = pool.request();
            queryParams.forEach(param => {
                countRequest = countRequest.input(param.name, param.type, param.value);
            });

            const countResult = await countRequest.query(`
                SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}
            `);

            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / limit);

            res.json({
                orders: result.recordset,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: totalPages,
                    total_items: total,
                    items_per_page: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Get all orders error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Cập nhật trạng thái đơn hàng (Admin only)
    updateOrderStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
            }

            const pool = getPool();
            await pool.request()
                .input('orderId', sql.Int, id)
                .input('status', sql.NVarChar, status)
                .query('UPDATE orders SET status = @status, updated_at = GETDATE() WHERE order_id = @orderId');

            res.json({ message: 'Cập nhật trạng thái đơn hàng thành công' });
        } catch (error) {
            console.error('Update order status error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Thống kê đơn hàng (Admin only)
    getOrderStats: async (req, res) => {
        try {
            const pool = getPool();

            // Thống kê tổng quan
            const overviewResult = await pool.request().query(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
                    SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                    SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END) as total_revenue
                FROM orders
            `);

            // Doanh thu theo tháng (12 tháng gần nhất)
            const revenueResult = await pool.request().query(`
                SELECT 
                    YEAR(created_at) as year,
                    MONTH(created_at) as month,
                    SUM(total_amount) as revenue,
                    COUNT(*) as order_count
                FROM orders
                WHERE status = 'delivered' AND created_at >= DATEADD(month, -12, GETDATE())
                GROUP BY YEAR(created_at), MONTH(created_at)
                ORDER BY year DESC, month DESC
            `);

            // Sản phẩm bán chạy nhất
            const topProductsResult = await pool.request().query(`
                SELECT TOP 10
                    p.product_id, p.name, p.image_url,
                    SUM(od.quantity) as total_sold,
                    SUM(od.quantity * od.price) as revenue
                FROM order_details od
                JOIN products p ON od.product_id = p.product_id
                JOIN orders o ON od.order_id = o.order_id
                WHERE o.status = 'delivered'
                GROUP BY p.product_id, p.name, p.image_url
                ORDER BY total_sold DESC
            `);

            res.json({
                overview: overviewResult.recordset[0],
                monthly_revenue: revenueResult.recordset,
                top_products: topProductsResult.recordset
            });
        } catch (error) {
            console.error('Get order stats error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
};

module.exports = orderController;