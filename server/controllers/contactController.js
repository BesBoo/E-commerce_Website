// server/controllers/contactController.js
const { getPool, sql } = require('../config/db');

const contactController = {
    // Create new contact
    createContact: async (req, res) => {
        try {
            const { name, phone, email, message } = req.body;
            
            // Validate input
            if (!name || !phone || !email || !message) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email không hợp lệ'
                });
            }

            // Validate phone format (Vietnamese phone numbers)
            const phoneRegex = /^[0-9]{10,11}$/;
            if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Số điện thoại không hợp lệ'
                });
            }

            // Get database pool
            const pool = getPool();

            // Insert contact into database
            const result = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .input('phone', sql.VarChar, phone.replace(/\s+/g, ''))
                .input('email', sql.VarChar, email.toLowerCase().trim())
                .input('message', sql.NText, message.trim())
                .query(`
                    INSERT INTO contact (name, phone, email, message) 
                    VALUES (@name, @phone, @email, @message);
                    SELECT SCOPE_IDENTITY() as contactId;
                `);

            const contactId = result.recordset[0].contactId;

            res.status(201).json({
                success: true,
                message: 'Liên hệ của bạn đã được gửi thành công. Chúng tôi sẽ phản hồi sớm nhất có thể.',
                contactId: contactId
            });

        } catch (error) {
            console.error('Create contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    },

    // Get all contacts (for admin)
    getAllContacts: async (req, res) => {
        try {
            const { page = 1, limit = 10, status } = req.query;
            const offset = (page - 1) * limit;
            
            const pool = getPool();
            
            let query = `
                SELECT id, name, phone, email, message, status, created_at, updated_at
                FROM contact
            `;
            let countQuery = `SELECT COUNT(*) as total FROM contact`;
            
            const request = pool.request();
            const countRequest = pool.request();

            // Filter by status if provided
            if (status && ['pending', 'processing', 'resolved'].includes(status)) {
                query += ' WHERE status = @status';
                countQuery += ' WHERE status = @status';
                request.input('status', sql.VarChar, status);
                countRequest.input('status', sql.VarChar, status);
            }

            // Add ordering and pagination
            query += ' ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
            request.input('offset', sql.Int, parseInt(offset));
            request.input('limit', sql.Int, parseInt(limit));

            // Execute queries
            const [contacts, totalResult] = await Promise.all([
                request.query(query),
                countRequest.query(countQuery)
            ]);
            
            const total = totalResult.recordset[0].total;

            res.json({
                success: true,
                data: contacts.recordset,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    totalPages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('Get all contacts error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    },

    // Get contact details
    getContact: async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID liên hệ không hợp lệ'
                });
            }

            const pool = getPool();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT id, name, phone, email, message, status, created_at, updated_at
                    FROM contact 
                    WHERE id = @id
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy liên hệ'
                });
            }

            res.json({
                success: true,
                data: result.recordset[0]
            });

        } catch (error) {
            console.error('Get contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    },

    // Update contact status (for admin)
    updateContactStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID liên hệ không hợp lệ'
                });
            }

            if (!status || !['pending', 'processing', 'resolved'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Trạng thái không hợp lệ'
                });
            }

            const pool = getPool();

            // Check if contact exists
            const checkResult = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT id FROM contact WHERE id = @id');

            if (checkResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy liên hệ'
                });
            }

            // Update status
            await pool.request()
                .input('status', sql.VarChar, status)
                .input('id', sql.Int, id)
                .query(`
                    UPDATE contact 
                    SET status = @status, updated_at = GETDATE() 
                    WHERE id = @id
                `);

            res.json({
                success: true,
                message: 'Đã cập nhật trạng thái liên hệ'
            });

        } catch (error) {
            console.error('Update contact status error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    },

    // Delete contact (for admin)
    deleteContact: async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID liên hệ không hợp lệ'
                });
            }

            const pool = getPool();

            // Check if contact exists
            const checkResult = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT id FROM contact WHERE id = @id');

            if (checkResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy liên hệ'
                });
            }

            // Delete contact
            await pool.request()
                .input('id', sql.Int, id)
                .query('DELETE FROM contact WHERE id = @id');

            res.json({
                success: true,
                message: 'Đã xóa liên hệ'
            });

        } catch (error) {
            console.error('Delete contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    },

    // Contact statistics (for admin)
    getContactStats: async (req, res) => {
        try {
            const pool = getPool();
            const result = await pool.request().query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
                    SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                    SUM(CASE WHEN CAST(created_at AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as today,
                    SUM(CASE WHEN created_at >= DATEADD(DAY, -7, GETDATE()) THEN 1 ELSE 0 END) as this_week,
                    SUM(CASE WHEN created_at >= DATEADD(DAY, -30, GETDATE()) THEN 1 ELSE 0 END) as this_month
                FROM contact
            `);

            res.json({
                success: true,
                data: result.recordset[0]
            });

        } catch (error) {
            console.error('Get contact stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    }
};

module.exports = contactController;