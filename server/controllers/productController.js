// server/controllers/productController.js

const { getPool, sql } = require('../config/db');

const productController = {
    
    // Lấy tất cả sản phẩm với phân trang và lọc
    getAllProducts : async (req, res) => {
        try {
            const pool = getPool();
            const { 
                page = 1, 
                limit = 12, 
                category, 
                search, 
                sort = 'newest',
                min_price,
                max_price,
                brand 
            } = req.query;

            const offset = (parseInt(page) - 1) * parseInt(limit);
            
            // Build WHERE conditions
            let whereConditions = ['p.stock > 0'];
            let queryParams = [];
            
            if (category) {
                whereConditions.push('c.name = @category');
                queryParams.push({ name: 'category', type: sql.NVarChar(100), value: category });
            }
            
            if (search) {
                whereConditions.push('(p.name LIKE @search OR p.brand LIKE @search)');
                queryParams.push({ name: 'search', type: sql.NVarChar(255), value: `%${search}%` });
            }
            
            if (min_price) {
                whereConditions.push('p.price >= @min_price');
                queryParams.push({ name: 'min_price', type: sql.Decimal(18,2), value: parseFloat(min_price) });
            }
            
            if (max_price) {
                whereConditions.push('p.price <= @max_price');
                queryParams.push({ name: 'max_price', type: sql.Decimal(18,2), value: parseFloat(max_price) });
            }
            
            if (brand) {
                whereConditions.push('p.brand = @brand');
                queryParams.push({ name: 'brand', type: sql.NVarChar(100), value: brand });
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
            
            // Determine ORDER BY clause
            let orderBy;
            switch (sort) {
                case 'price_asc':
                    orderBy = 'ORDER BY p.price ASC';
                    break;
                case 'price_desc':
                    orderBy = 'ORDER BY p.price DESC';
                    break;
                case 'name':
                    orderBy = 'ORDER BY p.name ASC';
                    break;
                case 'newest':
                default:
                    orderBy = 'ORDER BY p.created_at DESC, p.product_id DESC';
                    break;
            }

            // Main query - FIXED: Không sử dụng GROUP BY với created_at nếu không cần thiết
            const query = `
                SELECT 
                    p.product_id,
                    p.name,
                    p.price,
                    p.image_url,
                    p.discount_percent,
                    p.brand,
                    p.stock,
                    p.created_at,
                    c.name as category_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.category_id
                ${whereClause}
                ${orderBy}
                OFFSET @offset ROWS 
                FETCH NEXT @limit ROWS ONLY
            `;

            // Count query
            const countQuery = `
                SELECT COUNT(*) as total
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.category_id
                ${whereClause}
            `;

            // Execute queries
            const request = pool.request()
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, parseInt(limit));

            // Add parameters
            queryParams.forEach(param => {
                request.input(param.name, param.type, param.value);
            });

            const [result, countResult] = await Promise.all([
                request.query(query),
                request.query(countQuery)
            ]);

            const products = result.recordset.map(product => ({
                product_id: product.product_id,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                discount_percent: product.discount_percent || 0,
                brand: product.brand,
                category_name: product.category_name,
                stock: product.stock,
                created_at: product.created_at
            }));

            const total = countResult.recordset[0].total;
            const totalPages = Math.ceil(total / parseInt(limit));

            res.json({
                products,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: totalPages,
                    total_items: total,
                    items_per_page: parseInt(limit),
                    has_next: parseInt(page) < totalPages,
                    has_prev: parseInt(page) > 1
                }
            });
        } catch (error) {
            console.error('Get products error:', error);
            res.status(500).json({ 
                message: 'Không thể tải danh sách sản phẩm',
                error: error.message,
                code: 'GET_PRODUCTS_ERROR'
            });
        }
    },
    // Lấy chi tiết sản phẩm
    getProductById: async (req, res) => {
        try {
            const { productId } = req.params; // Lấy từ URL parameter
            console.log('Getting product with ID:', productId); // Debug log

            const pool = getPool();

            const result = await pool.request()
                .input('productId', sql.Int, parseInt(productId))
                .query(`
                    SELECT 
                        p.product_id, p.name, p.description, p.price, p.stock,
                        p.image_url, p.images, p.colors, p.sizes, p.brand,
                        p.is_featured, p.is_new, p.discount_percent, p.created_at,
                        c.name as category_name, c.category_id,
                        AVG(CAST(r.rating as FLOAT)) as avg_rating,
                        COUNT(r.review_id) as review_count
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.category_id
                    LEFT JOIN reviews r ON p.product_id = r.product_id
                    WHERE p.product_id = @productId
                    GROUP BY p.product_id, p.name, p.description, p.price, p.stock,
                             p.image_url, p.images, p.colors, p.sizes, p.brand,
                             p.is_featured, p.is_new, p.discount_percent, p.created_at,
                             c.name, c.category_id
                `);

            console.log('Database query result:', result.recordset); // Debug log

            if (result.recordset.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Sản phẩm không tồn tại' 
                });
            }

            // Lấy đánh giá sản phẩm
            const reviews = await pool.request()
                .input('productId', sql.Int, parseInt(productId))
                .query(`
                    SELECT r.*, u.username, u.full_name
                    FROM reviews r
                    JOIN users u ON r.user_id = u.user_id
                    WHERE r.product_id = @productId
                    ORDER BY r.created_at DESC
                `);

            const product = result.recordset[0];
            product.reviews = reviews.recordset;

            console.log('Returning product data:', product); // Debug log

            res.json({ 
                success: true,
                product 
            });
        } catch (error) {
            console.error('Get product by id error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server', 
                error: error.message 
            });
        }
    },

    // Lấy sản phẩm nổi bật
    getFeaturedProducts : async (req, res) => {
        try {
            const pool = getPool();
            
            // FIXED: Sử dụng MAX(p.created_at) trong GROUP BY hoặc bỏ ORDER BY created_at
            const result = await pool.request()
                .query(`
                    SELECT TOP 8
                        p.product_id,
                        p.name,
                        p.price,
                        p.image_url,
                        p.discount_percent,
                        p.brand,
                        c.name as category_name,
                        p.stock,
                        -- Tính điểm nổi bật dựa trên số lượng đánh giá và rating trung bình
                        COALESCE(AVG(CAST(r.rating as FLOAT)), 0) as avg_rating,
                        COUNT(r.review_id) as review_count
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.category_id
                    LEFT JOIN reviews r ON p.product_id = r.product_id
                    WHERE p.stock > 0 
                    GROUP BY 
                        p.product_id, p.name, p.price, p.image_url, p.discount_percent, 
                        p.brand, c.name, p.stock
                    HAVING COUNT(r.review_id) > 0 OR AVG(CAST(r.rating as FLOAT)) >= 4
                    ORDER BY 
                        (COUNT(r.review_id) * 0.3 + COALESCE(AVG(CAST(r.rating as FLOAT)), 0) * 0.7) DESC,
                        p.product_id DESC
                `);

            const featuredProducts = result.recordset.map(product => ({
                product_id: product.product_id,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                discount_percent: product.discount_percent || 0,
                brand: product.brand,
                category_name: product.category_name,
                stock: product.stock,
                avg_rating: Math.round(product.avg_rating * 10) / 10, // Làm tròn 1 chữ số thập phân
                review_count: product.review_count
            }));

            res.json({
                products: featuredProducts,
                total: featuredProducts.length
            });
        } catch (error) {
            console.error('Get featured products error:', error);
            res.status(500).json({ 
                message: 'Không thể tải sản phẩm nổi bật',
                error: error.message,
                code: 'GET_FEATURED_ERROR'
            });
        }
    },

    // Lấy sản phẩm mới
    getNewProducts : async (req, res) => {
        try {
            const pool = getPool();
            
            // FIXED: Sử dụng subquery để lấy sản phẩm mới nhất mà không cần GROUP BY với created_at
            const result = await pool.request()
                .query(`
                    SELECT TOP 8
                        p.product_id,
                        p.name,
                        p.price,
                        p.image_url,
                        p.discount_percent,
                        p.brand,
                        c.name as category_name,
                        p.stock,
                        p.created_at
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.category_id
                    WHERE p.stock > 0
                    ORDER BY p.created_at DESC, p.product_id DESC
                `);

            const newProducts = result.recordset.map(product => ({
                product_id: product.product_id,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                discount_percent: product.discount_percent || 0,
                brand: product.brand,
                category_name: product.category_name,
                stock: product.stock,
                created_at: product.created_at
            }));

            res.json({
                products: newProducts,
                total: newProducts.length
            });
        } catch (error) {
            console.error('Get new products error:', error);
            res.status(500).json({ 
                message: 'Không thể tải sản phẩm mới',
                error: error.message,
                code: 'GET_NEW_ERROR'
            });
        }
    },

    // Tạo sản phẩm mới (Admin only)
    createProduct: async (req, res) => {
        try {
            const {
                name, description, price, stock, category_id,
                image_url, images, colors, sizes, brand,
                is_featured, is_new, discount_percent
            } = req.body;

            const pool = getPool();
            const result = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('description', sql.NVarChar, description)
                .input('price', sql.Decimal(18,2), price)
                .input('stock', sql.Int, stock)
                .input('category_id', sql.Int, category_id)
                .input('image_url', sql.NVarChar, image_url)
                .input('images', sql.NVarChar, images ? JSON.stringify(images) : null)
                .input('colors', sql.NVarChar, colors ? JSON.stringify(colors) : null)
                .input('sizes', sql.NVarChar, sizes ? JSON.stringify(sizes) : null)
                .input('brand', sql.NVarChar, brand)
                .input('is_featured', sql.Bit, is_featured || false)
                .input('is_new', sql.Bit, is_new || false)
                .input('discount_percent', sql.Int, discount_percent || 0)
                .query(`
                    INSERT INTO products (
                        name, description, price, stock, category_id, image_url,
                        images, colors, sizes, brand, is_featured, is_new, discount_percent
                    )
                    OUTPUT INSERTED.product_id
                    VALUES (
                        @name, @description, @price, @stock, @category_id, @image_url,
                        @images, @colors, @sizes, @brand, @is_featured, @is_new, @discount_percent
                    )
                `);

            res.status(201).json({
                message: 'Tạo sản phẩm thành công',
                product_id: result.recordset[0].product_id
            });
        } catch (error) {
            console.error('Create product error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Cập nhật sản phẩm (Admin only)
    updateProduct: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name, description, price, stock, category_id,
                image_url, images, colors, sizes, brand,
                is_featured, is_new, discount_percent
            } = req.body;

            const pool = getPool();
            await pool.request()
                .input('productId', sql.Int, id)
                .input('name', sql.NVarChar, name)
                .input('description', sql.NVarChar, description)
                .input('price', sql.Decimal(18,2), price)
                .input('stock', sql.Int, stock)
                .input('category_id', sql.Int, category_id)
                .input('image_url', sql.NVarChar, image_url)
                .input('images', sql.NVarChar, images ? JSON.stringify(images) : null)
                .input('colors', sql.NVarChar, colors ? JSON.stringify(colors) : null)
                .input('sizes', sql.NVarChar, sizes ? JSON.stringify(sizes) : null)
                .input('brand', sql.NVarChar, brand)
                .input('is_featured', sql.Bit, is_featured || false)
                .input('is_new', sql.Bit, is_new || false)
                .input('discount_percent', sql.Int, discount_percent || 0)
                .query(`
                    UPDATE products 
                    SET name = @name, description = @description, price = @price,
                        stock = @stock, category_id = @category_id, image_url = @image_url,
                        images = @images, colors = @colors, sizes = @sizes, brand = @brand,
                        is_featured = @is_featured, is_new = @is_new, 
                        discount_percent = @discount_percent, updated_at = GETDATE()
                    WHERE product_id = @productId
                `);

            res.json({ message: 'Cập nhật sản phẩm thành công' });
        } catch (error) {
            console.error('Update product error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Xóa sản phẩm (Admin only)
    deleteProduct: async (req, res) => {
        try {
            const { id } = req.params;
            const pool = getPool();

            await pool.request()
                .input('productId', sql.Int, id)
                .query('DELETE FROM products WHERE product_id = @productId');

            res.json({ message: 'Xóa sản phẩm thành công' });
        } catch (error) {
            console.error('Delete product error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Thêm đánh giá sản phẩm
    addReview: async (req, res) => {
        try {
            const { productId, rating, comment } = req.body;
            const pool = getPool();

            // Kiểm tra user đã mua sản phẩm này chưa
            const purchaseCheck = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, productId)
                .query(`
                    SELECT COUNT(*) as count
                    FROM order_details od
                    JOIN orders o ON od.order_id = o.order_id
                    WHERE o.user_id = @userId AND od.product_id = @productId 
                    AND o.status = 'delivered'
                `);

            if (purchaseCheck.recordset[0].count === 0) {
                return res.status(400).json({ 
                    message: 'Bạn cần mua sản phẩm này trước khi đánh giá' 
                });
            }

            // Kiểm tra đã đánh giá chưa
            const existingReview = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, productId)
                .query('SELECT review_id FROM reviews WHERE user_id = @userId AND product_id = @productId');

            if (existingReview.recordset.length > 0) {
                return res.status(400).json({ message: 'Bạn đã đánh giá sản phẩm này rồi' });
            }

            // Thêm đánh giá
            await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('productId', sql.Int, productId)
                .input('rating', sql.Int, rating)
                .input('comment', sql.NVarChar, comment)
                .query(`
                    INSERT INTO reviews (user_id, product_id, rating, comment)
                    VALUES (@userId, @productId, @rating, @comment)
                `);

            res.status(201).json({ message: 'Thêm đánh giá thành công' });
        } catch (error) {
            console.error('Add review error:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }
};

module.exports = productController;