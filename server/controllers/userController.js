// userController.js - Fixed version
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { getPool, sql } = require('../config/db');
const { generateToken } = require('../middleware/auth');

const userController = {
    // Đăng ký user mới
    register: async (req, res) => {
        try {
            console.log('📝 Register request body:', req.body);
            
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('❌ Validation errors:', errors.array());
                return res.status(400).json({ 
                    message: 'Dữ liệu không hợp lệ',
                    errors: errors.array() 
                });
            }

            const { username, email, password, phone, full_name } = req.body;

            // Kiểm tra required fields
            if (!username || !email || !password) {
                return res.status(400).json({ 
                    message: 'Username, email và password là bắt buộc' 
                });
            }

            const pool = getPool();

            // Kiểm tra username và email đã tồn tại
            console.log('🔍 Checking existing user...');
            const checkUser = await pool.request()
                .input('username', sql.NVarChar(50), username)
                .input('email', sql.NVarChar(100), email)
                .query('SELECT user_id FROM users WHERE username = @username OR email = @email');

            if (checkUser.recordset.length > 0) {
                console.log('❌ User already exists');
                return res.status(400).json({ 
                    message: 'Username hoặc email đã tồn tại' 
                });
            }

            // Hash password
            console.log('🔐 Hashing password...');
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            console.log('✅ Password hashed successfully');

            // Thêm user mới
            console.log('💾 Creating new user...');
            const result = await pool.request()
                .input('username', sql.NVarChar(50), username)
                .input('password_hash', sql.NVarChar(255), hashedPassword)
                .input('email', sql.NVarChar(100), email)
                .input('phone', sql.NVarChar(20), phone || null)
                .input('full_name', sql.NVarChar(100), full_name || null)
                .query(`
                    INSERT INTO users (username, password_hash, email, phone, full_name)
                    OUTPUT INSERTED.user_id, INSERTED.username, INSERTED.email, INSERTED.role
                    VALUES (@username, @password_hash, @email, @phone, @full_name)
                `);

            console.log('✅ User created:', result.recordset[0]);
            const newUser = result.recordset[0];
            const token = generateToken(newUser.user_id, newUser.username, newUser.role);

            res.status(201).json({
                message: 'Đăng ký thành công',
                user: {
                    user_id: newUser.user_id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role
                },
                token
            });
        } catch (error) {
            console.error('❌ Register error:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                number: error.number,
                state: error.state
            });
            res.status(500).json({ 
                message: 'Lỗi server khi đăng ký', 
                error: error.message 
            });
        }
    },

    // Đăng nhập
    login: async (req, res) => {
        try {
            console.log('🔑 Login request:', { username: req.body.username, hasPassword: !!req.body.password });
            
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ 
                    message: 'Vui lòng nhập username và password' 
                });
            }

            const pool = getPool();
            
            // Tìm user trong database
            console.log('🔍 Looking for user:', username);
            const result = await pool.request()
                .input('username', sql.NVarChar(50), username)
                .query(`
                    SELECT user_id, username, password_hash, email, role, full_name 
                    FROM users 
                    WHERE username = @username
                `);

            console.log('👤 User query result:', result.recordset.length, 'users found');
            
            if (result.recordset.length === 0) {
                console.log('❌ User not found');
                return res.status(401).json({ 
                    message: 'Username hoặc password không đúng' 
                });
            }

            const user = result.recordset[0];
            console.log('👤 Found user:', { 
                user_id: user.user_id, 
                username: user.username,
                email: user.email,
                role: user.role,
                hasPasswordHash: !!user.password_hash
            });

            // So sánh password
            console.log('🔐 Comparing passwords...');
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            console.log('✅ Password comparison result:', isValidPassword);

            if (!isValidPassword) {
                console.log('❌ Invalid password');
                return res.status(401).json({ 
                    message: 'Username hoặc password không đúng' 
                });
            }

            // Generate token
            console.log('🎫 Generating token...');
            const token = generateToken(user.user_id, user.username, user.role);

            console.log('✅ Login successful');
            res.json({
                message: 'Đăng nhập thành công',
                user: {
                    user_id: user.user_id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    full_name: user.full_name
                },
                token
            });
        } catch (error) {
            console.error('❌ Login error:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                number: error.number,
                state: error.state
            });
            res.status(500).json({ 
                message: 'Lỗi server khi đăng nhập', 
                error: error.message 
            });
        }
    },

    // Lấy thông tin profile
    getProfile: async (req, res) => {
        try {
            console.log('👤 Getting profile for user:', req.user.user_id);
            
            const pool = getPool();
            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query(`
                    SELECT user_id, username, email, phone, full_name, address, created_at, updated_at
                    FROM users WHERE user_id = @userId
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ message: 'User không tồn tại' });
            }

            res.json({ user: result.recordset[0] });
        } catch (error) {
            console.error('❌ Get profile error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi lấy thông tin profile', 
                error: error.message 
            });
        }
    },

    // Cập nhật profile
    updateProfile: async (req, res) => {
        try {
            console.log('📝 Updating profile for user:', req.user.user_id, req.body);
            
            const { phone, full_name, address } = req.body;
            const pool = getPool();

            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('phone', sql.NVarChar(20), phone || null)
                .input('full_name', sql.NVarChar(100), full_name || null)
                .input('address', sql.NVarChar(255), address || null)
                .query(`
                    UPDATE users 
                    SET phone = @phone, full_name = @full_name, address = @address, updated_at = GETDATE()
                    WHERE user_id = @userId
                `);

            console.log('✅ Profile updated, rows affected:', result.rowsAffected[0]);
            res.json({ message: 'Cập nhật thông tin thành công' });
        } catch (error) {
            console.error('❌ Update profile error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi cập nhật profile', 
                error: error.message 
            });
        }
    },

    // Đổi mật khẩu
    changePassword: async (req, res) => {
        try {
            console.log('🔐 Changing password for user:', req.user.user_id);
            
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ 
                    message: 'Vui lòng nhập đầy đủ thông tin' 
                });
            }

            const pool = getPool();
            
            // Lấy mật khẩu hiện tại
            const result = await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .query('SELECT password_hash FROM users WHERE user_id = @userId');

            if (result.recordset.length === 0) {
                return res.status(404).json({ message: 'User không tồn tại' });
            }

            const user = result.recordset[0];
            const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

            if (!isValidPassword) {
                return res.status(400).json({ 
                    message: 'Mật khẩu hiện tại không đúng' 
                });
            }

            // Hash mật khẩu mới
            const saltRounds = 10;
            const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

            // Cập nhật mật khẩu
            await pool.request()
                .input('userId', sql.Int, req.user.user_id)
                .input('password_hash', sql.NVarChar(255), hashedNewPassword)
                .query(`
                    UPDATE users 
                    SET password_hash = @password_hash, updated_at = GETDATE() 
                    WHERE user_id = @userId
                `);

            console.log('✅ Password changed successfully');
            res.json({ message: 'Đổi mật khẩu thành công' });
        } catch (error) {
            console.error('❌ Change password error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi đổi mật khẩu', 
                error: error.message 
            });
        }
    },

    // Lấy danh sách users (Admin only)
    getAllUsers: async (req, res) => {
        try {
            console.log('👥 Getting all users (Admin request)');
            
            const pool = getPool();
            const result = await pool.request().query(`
                SELECT user_id, username, email, phone, full_name, role, created_at, updated_at
                FROM users
                ORDER BY created_at DESC
            `);

            console.log('✅ Found', result.recordset.length, 'users');
            res.json({ users: result.recordset });
        } catch (error) {
            console.error('❌ Get all users error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi lấy danh sách users', 
                error: error.message 
            });
        }
    },

    // Cập nhật role user (Admin only)
    updateUserRole: async (req, res) => {
        try {
            console.log('👑 Updating user role:', req.body);
            
            const { userId, role } = req.body;

            if (!['user', 'admin'].includes(role)) {
                return res.status(400).json({ message: 'Role không hợp lệ' });
            }

            const pool = getPool();
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .input('role', sql.NVarChar(20), role)
                .query(`
                    UPDATE users 
                    SET role = @role, updated_at = GETDATE() 
                    WHERE user_id = @userId
                `);

            console.log('✅ Role updated, rows affected:', result.rowsAffected[0]);
            res.json({ message: 'Cập nhật role thành công' });
        } catch (error) {
            console.error('❌ Update user role error:', error);
            res.status(500).json({ 
                message: 'Lỗi server khi cập nhật role', 
                error: error.message 
            });
        }
    },

    // Test function để kiểm tra database connection
    testDB: async (req, res) => {
        try {
            const pool = getPool();
            const result = await pool.request().query('SELECT COUNT(*) as total FROM users');
            res.json({ 
                message: 'Database connection OK',
                totalUsers: result.recordset[0].total
            });
        } catch (error) {
            console.error('❌ Database test error:', error);
            res.status(500).json({ 
                message: 'Database connection failed', 
                error: error.message 
            });
        }
    }
};

module.exports = userController;