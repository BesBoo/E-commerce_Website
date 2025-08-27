// auth.js 


const Auth = {
    
    // Login function
    async login(credentials) {
        try {
            // Validate input data
            if (!credentials.username || !credentials.password) {
                throw new Error('Vui lòng nhập đầy đủ thông tin đăng nhập');
            }

            // Call login API from api.js
            const response = await API.auth.login(credentials);
            
            if (response.token && response.user) {
                // Login successful
                console.log('Login successful:', response.user);
                
                // Show success message
                this.showMessage('Đăng nhập thành công!', 'success');
                
                // Small delay to show success message
                setTimeout(() => {
                    // Check if there's a redirect URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirectUrl = urlParams.get('redirect');
                    
                    // Redirect to intended page or home
                    window.location.href = redirectUrl || './index.html';
                }, 1000);
                
                return response;
            } else {
                throw new Error('Phản hồi từ server không hợp lệ');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            
            // Show error message
            let errorMessage = 'Đăng nhập thất bại. Vui lòng thử lại.';
            
            if (error.message) {
                if (error.message.includes('Username hoặc password không đúng')) {
                    errorMessage = 'Tên đăng nhập hoặc mật khẩu không đúng';
                } else if (error.message.includes('User không tồn tại')) {
                    errorMessage = 'Tài khoản không tồn tại';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMessage = 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';
                } else {
                    errorMessage = error.message;
                }
            }
            
            this.showMessage(errorMessage, 'error');
            throw error;
        }
    },

    // Register function
    async register(userData) {
        try {
            // Validate required fields
            if (!userData.username || !userData.email || !userData.password) {
                throw new Error('Vui lòng nhập đầy đủ thông tin bắt buộc');
            }

            // Additional validation
            if (userData.password.length < 6) {
                throw new Error('Mật khẩu phải có ít nhất 6 ký tự');
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userData.email)) {
                throw new Error('Email không hợp lệ');
            }

            // Call register API from api.js
            const response = await API.auth.register(userData);
            
            if (response.token && response.user) {
                // Registration successful
                console.log('Registration successful:', response.user);
                
                // Show success message
                this.showMessage('Đăng ký thành công! Chào mừng bạn đến với BesBoo.', 'success');
                
                // Small delay to show success message
                setTimeout(() => {
                    // Redirect to home page
                    window.location.href = './index.html';
                }, 1500);
                
                return response;
            } else {
                throw new Error('Phản hồi từ server không hợp lệ');
            }
            
        } catch (error) {
            console.error('Registration error:', error);
            
            // Show error message
            let errorMessage = 'Đăng ký thất bại. Vui lòng thử lại.';
            
            if (error.message) {
                if (error.message.includes('Username hoặc email đã tồn tại')) {
                    errorMessage = 'Tên đăng nhập hoặc email đã được sử dụng';
                } else if (error.message.includes('email đã tồn tại')) {
                    errorMessage = 'Email này đã được đăng ký';
                } else if (error.message.includes('username đã tồn tại')) {
                    errorMessage = 'Tên đăng nhập đã được sử dụng';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMessage = 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';
                } else {
                    errorMessage = error.message;
                }
            }
            
            this.showMessage(errorMessage, 'error');
            throw error;
        }
    },

    // Logout function
    logout() {
        try {
            // Clear auth data from localStorage
            Utils.clearAuth();
            
            // Show logout message
            this.showMessage('Đã đăng xuất thành công', 'success');
            
            // Redirect to home page
            setTimeout(() => {
                window.location.href = '/client/index.html';
            }, 1000);
            
        } catch (error) {
            console.error('Logout error:', error);
            // Even if there's an error, still redirect
            window.location.href = './index.html';
        }
    },

    // Check if user is logged in
    isLoggedIn() {
        const token = Utils.getToken();
        const user = Utils.getUser();
        return !!(token && user);
    },

    // Get current user
    getCurrentUser() {
        return Utils.getUser();
    },

    // Check user role
    isAdmin() {
        const user = this.getCurrentUser();
        return user && user.role === 'admin';
    },

    // Update profile
    async updateProfile(profileData) {
        try {
            const response = await API.auth.updateProfile(profileData);
            
            // Update user data in localStorage
            const currentUser = Utils.getUser();
            const updatedUser = { ...currentUser, ...profileData };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            this.showMessage('Cập nhật thông tin thành công', 'success');
            return response;
            
        } catch (error) {
            console.error('Update profile error:', error);
            this.showMessage(error.message || 'Cập nhật thông tin thất bại', 'error');
            throw error;
        }
    },

    // Change password
    async changePassword(passwordData) {
        try {
            if (!passwordData.currentPassword || !passwordData.newPassword) {
                throw new Error('Vui lòng nhập đầy đủ thông tin');
            }

            if (passwordData.newPassword.length < 6) {
                throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
            }

            const response = await API.auth.changePassword(passwordData);
            
            this.showMessage('Đổi mật khẩu thành công', 'success');
            return response;
            
        } catch (error) {
            console.error('Change password error:', error);
            this.showMessage(error.message || 'Đổi mật khẩu thất bại', 'error');
            throw error;
        }
    },

    // Show message function (enhanced to work with different page layouts)
    showMessage(message, type = 'info') {
        // Try to use existing alert container first
        let alertContainer = document.getElementById('alertContainer');
        
        // If no alert container, create a toast notification
        if (!alertContainer) {
            this.showToast(message, type);
            return;
        }

        // Use alert container if available
        const alertClass = type === 'error' ? 'alert-error' : 
                          type === 'success' ? 'alert-success' : 'alert-info';
        
        const iconClass = type === 'error' ? 'fa-exclamation-circle' : 
                         type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
        
        // Define colors for different message types
        const textColor = type === 'error' ? '#e74c3c' : 
                         type === 'success' ? '#27ae60' : '#3498db';
        
        alertContainer.innerHTML = `
            <div class="alert ${alertClass}" style="color: ${textColor};">
                <i class="fas ${iconClass}"></i>
                ${message}
                <button type="button" class="alert-close" style="color: ${textColor};">&times;</button>
            </div>
        `;
        
        // Add close functionality
        const closeBtn = alertContainer.querySelector('.alert-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                alertContainer.innerHTML = '';
            });
        }
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            if (alertContainer.innerHTML.includes(message)) {
                alertContainer.innerHTML = '';
            }
        }, 5000);
    },

    // Toast notification (fallback when no alert container)
    showToast(message, type = 'info') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.auth-toast');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `auth-toast auth-toast-${type}`;
        
        // Define colors for different message types
        const bgColor = type === 'success' ? '#27ae60' : 
                       type === 'error' ? '#e74c3c' : '#3498db';
        
        const textColor = 'white'; // Keep white text on colored background for better contrast
        
        const iconClass = type === 'error' ? 'fa-exclamation-circle' : 
                         type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
        
        toast.innerHTML = `
            <div class="auth-toast-content">
                <i class="fas ${iconClass}"></i>
                <span>${message}</span>
                <button class="auth-toast-close">&times;</button>
            </div>
        `;

        // Style the toast
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: ${textColor};
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 9999;
            max-width: 350px;
            animation: slideInRight 0.3s ease-out;
            font-weight: 500;
            border-left: 4px solid rgba(255,255,255,0.3);
        `;

        // Add animation CSS if not exists
        if (!document.getElementById('auth-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'auth-toast-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .auth-toast-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .auth-toast-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    margin-left: auto;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                }
                .auth-toast-close:hover {
                    opacity: 1;
                }
                
                /* Enhanced alert container styles for better color visibility */
                .alert-success {
                    background-color: rgba(39, 174, 96, 0.1);
                    border: 1px solid rgba(39, 174, 96, 0.3);
                    border-radius: 4px;
                    padding: 12px 15px;
                }
                
                .alert-error {
                    background-color: rgba(231, 76, 60, 0.1);
                    border: 1px solid rgba(231, 76, 60, 0.3);
                    border-radius: 4px;
                    padding: 12px 15px;
                }
                
                .alert-info {
                    background-color: rgba(52, 152, 219, 0.1);
                    border: 1px solid rgba(52, 152, 219, 0.3);
                    border-radius: 4px;
                    padding: 12px 15px;
                }
                
                .alert .fas {
                    margin-right: 8px;
                }
                
                .alert-close {
                    float: right;
                    background: none;
                    border: none;
                    font-size: 16px;
                    cursor: pointer;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                
                .alert-close:hover {
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto remove after 5 seconds
        const autoRemove = setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);

        // Manual close
        const closeBtn = toast.querySelector('.auth-toast-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoRemove);
            toast.remove();
        });
    },

    // Validate token (check if still valid)
    async validateToken() {
        try {
            const token = Utils.getToken();
            if (!token) return false;

            // Try to get profile to validate token
            await API.auth.getProfile();
            return true;
            
        } catch (error) {
            console.warn('Token validation failed:', error);
            // Clear invalid token
            Utils.clearAuth();
            return false;
        }
    },

    // Initialize authentication state
    async initialize() {
        try {
            const token = Utils.getToken();
            const user = Utils.getUser();
            
            if (token && user) {
                // Validate token
                const isValid = await this.validateToken();
                if (isValid) {
                    Utils.updateAuthUI(user);
                    return { isLoggedIn: true, user };
                }
            }
            
            Utils.updateAuthUI(null);
            return { isLoggedIn: false, user: null };
            
        } catch (error) {
            console.error('Auth initialization error:', error);
            Utils.updateAuthUI(null);
            return { isLoggedIn: false, user: null };
        }
    }
};

// Auto-initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.initialize();
});

// Make Auth available globally
window.Auth = Auth;