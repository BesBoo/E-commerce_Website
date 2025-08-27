// server/controllers/promotionController.js

const { getPool, sql } = require('../config/db');

const promotionController = {
    // Lấy tất cả mã khuyến mãi đang hoạt động
    getActivePromotions: async (req, res) => {
        try {
            const pool = getPool();
            const result = await pool.request()
                .query(`
                    SELECT 
                        promotion_id, code, discount_type, discount_value,
                        min_order_amount, start_date, end_date, usage_limit, used_count
                    FROM promotions
                    WHERE is_active = 1
                    AND (start_date IS NULL OR start_date <= GETDATE())
                    AND (end_date IS NULL OR end_date >= GETDATE())
                    AND (usage_limit IS NULL OR used_count < usage_limit)
                    ORDER BY created_at DESC
                `);

            res.json({ promotions: result.recordset });
        } catch (error) {
            console.error('Get active promotions error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Validate mã khuyến mãi
    validatePromotion: async (req, res) => {
        try {
            const { code, order_amount } = req.body;

            if (!code || !order_amount) {
                return res.status(400).json({ 
                    message: 'Mã khuyến mãi và tổng đơn hàng là bắt buộc' 
                });
            }

            const pool = getPool();
            const result = await pool.request()
                .input('code', sql.NVarChar, code.trim())
                .query(`
                    SELECT 
                        promotion_id, discount_type, discount_value,
                        min_order_amount, usage_limit, used_count
                    FROM promotions
                    WHERE code = @code AND is_active = 1
                    AND (start_date IS NULL OR start_date <= GETDATE())
                    AND (end_date IS NULL OR end_date >= GETDATE())
                `);

            if (result.recordset.length === 0) {
                return res.json({
                    valid: false,
                    message: 'Mã khuyến mãi không tồn tại hoặc đã hết hạn'
                });
            }

            const promotion = result.recordset[0];

            // Kiểm tra số lần sử dụng
            if (promotion.usage_limit && promotion.used_count >= promotion.usage_limit) {
                return res.json({
                    valid: false,
                    message: 'Mã khuyến mãi đã hết lượt sử dụng'
                });
            }

            // Kiểm tra tổng đơn hàng tối thiểu
            if (order_amount < promotion.min_order_amount) {
                return res.json({
                    valid: false,
                    message: `Đơn hàng tối thiểu ${formatCurrency(promotion.min_order_amount)} để sử dụng mã này`
                });
            }

            // Tính số tiền giảm
            let discount_amount = 0;
            if (promotion.discount_type === 'percent') {
                discount_amount = Math.floor(order_amount * promotion.discount_value / 100);
            } else {
                discount_amount = promotion.discount_value;
            }

            res.json({
                valid: true,
                discount_amount: discount_amount,
                discount_type: promotion.discount_type,
                discount_value: promotion.discount_value,
                message: `Giảm ${formatCurrency(discount_amount)}`
            });

        } catch (error) {
            console.error('Validate promotion error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Tạo mã khuyến mãi mới (Admin only)
    createPromotion: async (req, res) => {
        try {
            const {
                code, discount_type, discount_value, min_order_amount,
                start_date, end_date, usage_limit
            } = req.body;

            const pool = getPool();

            // Kiểm tra mã đã tồn tại chưa
            const existingResult = await pool.request()
                .input('code', sql.NVarChar, code)
                .query('SELECT promotion_id FROM promotions WHERE code = @code');

            if (existingResult.recordset.length > 0) {
                return res.status(400).json({ message: 'Mã khuyến mãi đã tồn tại' });
            }

            // Tạo mã khuyến mãi mới
            const result = await pool.request()
                .input('code', sql.NVarChar, code)
                .input('discount_type', sql.NVarChar, discount_type)
                .input('discount_value', sql.Int, discount_value)
                .input('min_order_amount', sql.Decimal(18,2), min_order_amount || 0)
                .input('start_date', sql.DateTime, start_date ? new Date(start_date) : null)
                .input('end_date', sql.DateTime, end_date ? new Date(end_date) : null)
                .input('usage_limit', sql.Int, usage_limit || null)
                .query(`
                    INSERT INTO promotions (
                        code, discount_type, discount_value, min_order_amount,
                        start_date, end_date, usage_limit
                    )
                    OUTPUT INSERTED.promotion_id
                    VALUES (
                        @code, @discount_type, @discount_value, @min_order_amount,
                        @start_date, @end_date, @usage_limit
                    )
                `);

            res.status(201).json({
                message: 'Tạo mã khuyến mãi thành công',
                promotion_id: result.recordset[0].promotion_id
            });
        } catch (error) {
            console.error('Create promotion error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Cập nhật mã khuyến mãi (Admin only)
    updatePromotion: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                code, discount_type, discount_value, min_order_amount,
                start_date, end_date, usage_limit, is_active
            } = req.body;

            const pool = getPool();

            // Kiểm tra mã khuyến mãi tồn tại
            const existingResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query('SELECT promotion_id FROM promotions WHERE promotion_id = @promotionId');

            if (existingResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Mã khuyến mãi không tồn tại' });
            }

            // Cập nhật mã khuyến mãi
            await pool.request()
                .input('promotionId', sql.Int, id)
                .input('code', sql.NVarChar, code)
                .input('discount_type', sql.NVarChar, discount_type)
                .input('discount_value', sql.Int, discount_value)
                .input('min_order_amount', sql.Decimal(18,2), min_order_amount || 0)
                .input('start_date', sql.DateTime, start_date ? new Date(start_date) : null)
                .input('end_date', sql.DateTime, end_date ? new Date(end_date) : null)
                .input('usage_limit', sql.Int, usage_limit || null)
                .input('is_active', sql.Bit, is_active !== undefined ? is_active : true)
                .query(`
                    UPDATE promotions 
                    SET code = @code, discount_type = @discount_type, 
                        discount_value = @discount_value, min_order_amount = @min_order_amount,
                        start_date = @start_date, end_date = @end_date, 
                        usage_limit = @usage_limit, is_active = @is_active
                    WHERE promotion_id = @promotionId
                `);

            res.json({ message: 'Cập nhật mã khuyến mãi thành công' });
        } catch (error) {
            console.error('Update promotion error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Xóa mã khuyến mãi (Admin only)
    deletePromotion: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = getPool();

            await pool.request()
                .input('promotionId', sql.Int, id)
                .query('DELETE FROM promotions WHERE promotion_id = @promotionId');

            res.json({ message: 'Xóa mã khuyến mãi thành công' });
        } catch (error) {
            console.error('Delete promotion error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Lấy tất cả mã khuyến mãi (Admin only)
    getAllPromotions: async (req, res) => {
        try {
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;
            const pool = getPool();

            const result = await pool.request()
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, parseInt(limit))
                .query(`
                    SELECT *
                    FROM promotions
                    ORDER BY created_at DESC
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `);

            // Đếm tổng số mã khuyến mãi
            const countResult = await pool.request()
                .query('SELECT COUNT(*) as total FROM promotions');

            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / limit);

            res.json({
                promotions: result.recordset,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: totalPages,
                    total_items: total,
                    items_per_page: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Get all promotions error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
};

// Helper function để format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

module.exports = promotionController;