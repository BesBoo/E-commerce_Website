// server/controllers/categoryController.js - Fixed version

const { getPool, sql } = require('../config/db');

const categoryController = {
    
    // Lấy tất cả danh mục với số lượng sản phẩm
    getCategories: async (req, res) => {
        try {
            console.log('Getting all categories...');
            const pool = getPool();
            
            const result = await pool.request()
                .query(`
                    SELECT 
                        c.category_id,
                        c.name,
                        c.description,
                        c.created_at,
                        COUNT(p.product_id) as product_count
                    FROM categories c
                    LEFT JOIN products p ON c.category_id = p.category_id AND p.stock > 0
                    GROUP BY c.category_id, c.name, c.description, c.created_at
                    ORDER BY c.name
                `);

            console.log('Categories found:', result.recordset.length);
            
            res.json({
                success: true,
                categories: result.recordset
            });
        } catch (error) {
            console.error('Get categories error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server khi lấy danh mục', 
                error: error.message 
            });
        }
    },

    // Lấy danh mục theo ID
    getCategoryById: async (req, res) => {
        try {
            const { categoryId } = req.params;
            console.log('Getting category by ID:', categoryId);
            
            if (!categoryId || isNaN(parseInt(categoryId))) {
                return res.status(400).json({ 
                    success: false,
                    message: 'ID danh mục không hợp lệ' 
                });
            }

            const pool = getPool();
            
            const result = await pool.request()
                .input('categoryId', sql.Int, parseInt(categoryId))
                .query(`
                    SELECT 
                        c.category_id,
                        c.name,
                        c.description,
                        c.created_at,
                        COUNT(p.product_id) as product_count
                    FROM categories c
                    LEFT JOIN products p ON c.category_id = p.category_id AND p.stock > 0
                    WHERE c.category_id = @categoryId
                    GROUP BY c.category_id, c.name, c.description, c.created_at
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Danh mục không tồn tại' 
                });
            }

            res.json({
                success: true,
                category: result.recordset[0]
            });
        } catch (error) {
            console.error('Get category by ID error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server khi lấy danh mục', 
                error: error.message 
            });
        }
    },

    // Tạo danh mục mới (Admin only)
    createCategory: async (req, res) => {
        try {
            const { name, description } = req.body;
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Tên danh mục không được để trống' 
                });
            }

            const pool = getPool();
            
            // Kiểm tra tên danh mục đã tồn tại chưa
            const existingCategory = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .query('SELECT category_id FROM categories WHERE name = @name');

            if (existingCategory.recordset.length > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Tên danh mục đã tồn tại' 
                });
            }

            // Tạo danh mục mới
            const result = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .input('description', sql.NVarChar, description || null)
                .query(`
                    INSERT INTO categories (name, description)
                    OUTPUT INSERTED.category_id
                    VALUES (@name, @description)
                `);

            res.status(201).json({
                success: true,
                message: 'Tạo danh mục thành công',
                category_id: result.recordset[0].category_id
            });
        } catch (error) {
            console.error('Create category error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server khi tạo danh mục', 
                error: error.message 
            });
        }
    },

    // Cập nhật danh mục (Admin only)
    updateCategory: async (req, res) => {
        try {
            const { categoryId } = req.params;
            const { name, description } = req.body;
            
            if (!categoryId || isNaN(parseInt(categoryId))) {
                return res.status(400).json({ 
                    success: false,
                    message: 'ID danh mục không hợp lệ' 
                });
            }

            if (!name || name.trim().length === 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Tên danh mục không được để trống' 
                });
            }

            const pool = getPool();
            
            // Kiểm tra danh mục có tồn tại không
            const categoryExists = await pool.request()
                .input('categoryId', sql.Int, parseInt(categoryId))
                .query('SELECT category_id FROM categories WHERE category_id = @categoryId');

            if (categoryExists.recordset.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Danh mục không tồn tại' 
                });
            }

            // Kiểm tra tên danh mục đã tồn tại chưa (trừ danh mục hiện tại)
            const existingCategory = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .input('categoryId', sql.Int, parseInt(categoryId))
                .query('SELECT category_id FROM categories WHERE name = @name AND category_id != @categoryId');

            if (existingCategory.recordset.length > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Tên danh mục đã tồn tại' 
                });
            }

            // Cập nhật danh mục
            await pool.request()
                .input('categoryId', sql.Int, parseInt(categoryId))
                .input('name', sql.NVarChar, name.trim())
                .input('description', sql.NVarChar, description || null)
                .query(`
                    UPDATE categories 
                    SET name = @name, 
                        description = @description, 
                        updated_at = GETDATE()
                    WHERE category_id = @categoryId
                `);

            res.json({
                success: true,
                message: 'Cập nhật danh mục thành công'
            });
        } catch (error) {
            console.error('Update category error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server khi cập nhật danh mục', 
                error: error.message 
            });
        }
    },

    // Xóa danh mục (Admin only)
    deleteCategory: async (req, res) => {
        try {
            const { categoryId } = req.params;
            
            if (!categoryId || isNaN(parseInt(categoryId))) {
                return res.status(400).json({ 
                    success: false,
                    message: 'ID danh mục không hợp lệ' 
                });
            }

            const pool = getPool();
            
            // Kiểm tra danh mục có sản phẩm không
            const productsInCategory = await pool.request()
                .input('categoryId', sql.Int, parseInt(categoryId))
                .query('SELECT COUNT(*) as count FROM products WHERE category_id = @categoryId');

            if (productsInCategory.recordset[0].count > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Không thể xóa danh mục có sản phẩm. Vui lòng xóa hoặc chuyển các sản phẩm sang danh mục khác trước.' 
                });
            }

            // Xóa danh mục
            const result = await pool.request()
                .input('categoryId', sql.Int, parseInt(categoryId))
                .query('DELETE FROM categories WHERE category_id = @categoryId');

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Danh mục không tồn tại' 
                });
            }

            res.json({
                success: true,
                message: 'Xóa danh mục thành công'
            });
        } catch (error) {
            console.error('Delete category error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server khi xóa danh mục', 
                error: error.message 
            });
        }
    }
};

module.exports = categoryController;