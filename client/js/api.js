// client/js/api.js - FIXED VERSION
// API Base URL
const API_BASE_URL = 'http://localhost:5000/api';

// Utility functions
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');
const setAuth = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
};
const clearAuth = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
};

// API request helper
const apiRequest = async (endpoint, options = {}) => {
    const token = getToken();
    
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = { message: await response.text() };
        }

        if (!response.ok) {
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        
        // Handle token expiry
        if (error.message.includes('Invalid token') || error.message.includes('token')) {
            clearAuth();
            window.location.href = '/login';
        }
        
        throw error;
    }
};

// Auth API
const authAPI = {
    async login(credentials) {
        const response = await apiRequest('/users/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        
        if (response.token) {
            setAuth(response.token, response.user);

            // Sync guest cart with server cart after successful login
            try {
                await cartAPI.syncGuestCartWithServer();
            } catch (error) {
                console.error('Failed to sync guest cart after login:', error);
            }
        }
        
        return response;
    },

    async register(userData) {
        const response = await apiRequest('/users/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        
        if (response.token) {
            setAuth(response.token, response.user);

            // Sync guest cart with server cart after successful registration
            try {
                await cartAPI.syncGuestCartWithServer();
            } catch (error) {
                console.error('Failed to sync guest cart after registration:', error);
            }
        }
        
        return response;
    },

    async logout() {
        clearAuth();
        window.location.href = '/';
    },

    async getProfile() {
        return await apiRequest('/users/profile');
    },

    async updateProfile(profileData) {
        return await apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    },

    async changePassword(passwordData) {
        return await apiRequest('/users/change-password', {
            method: 'PUT',
            body: JSON.stringify(passwordData)
        });
        }
};

// Products API
const productsAPI = {
    async getProducts(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return await apiRequest(`/products?${queryString}`);
    },

    async getProduct(id) {
        // Fix: Đảm bảo sử dụng đúng parameter name từ backend
        console.log('API: Getting product with ID:', id);
        return await apiRequest(`/products/${id}`);
    },

    async getFeaturedProducts() {
        return await apiRequest('/products/featured');
    },

    async getNewProducts() {
        return await apiRequest('/products/new');
    },

    async searchProducts(query, filters = {}) {
        const params = { search: query, ...filters };
        return await this.getProducts(params);
    },

    async addReview(reviewData) {
        return await apiRequest('/products/review', {
            method: 'POST',
            body: JSON.stringify(reviewData)
        });
    },

    // Admin functions
    async createProduct(productData) {
        return await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    },

    async updateProduct(id, productData) {
        return await apiRequest(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
    },

    async deleteProduct(id) {
        return await apiRequest(`/products/${id}`, {
            method: 'DELETE'
        });
    }
};

// Categories API
const categoriesAPI = {
    async getCategories() {
        return await apiRequest('/categories');
    },

    async createCategory(categoryData) {
        return await apiRequest('/categories', {
            method: 'POST',
            body: JSON.stringify(categoryData)
        });
    }
};

// FIXED: Cart API
// FIXED: Cart API Section Only
const cartAPI = {
    // Local storage key for guest cart
    GUEST_CART_KEY: 'guest_cart',
    
    async getCart() {
        const user = getUser();
        
        if (user) {
            // Authenticated user - get cart from server
            try {
                const response = await apiRequest('/cart');
                
                // Đồng nhất field names: backend trả về total_items, frontend sử dụng item_count
                return {
                    ...response,
                    item_count: response.total_items || 0  // Add item_count field for consistency
                };
            } catch (error) {
                console.error('Failed to get cart from server:', error);
                throw error;
            }
        } else {
            // Guest user - return mock cart structure to match server response
            return { 
                items: [], 
                total: 0, 
                item_count: 0,
                total_items: 0  // Keep both for compatibility
            };
        }
    },

    // FIXED: Add item to cart with better error handling and validation
    async addToCart(item) {
        const user = getUser();
        
        if (!user) {
            Utils.showToast('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng', 'error');
            // Redirect to login page
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
            return;
        }

        // Validate input data
        if (!item.product_id) {
            throw new Error('Product ID is required');
        }

        // FIXED: Ensure proper data types and field names
        const cartData = {
            product_id: parseInt(item.product_id),
            quantity: Math.max(1, parseInt(item.quantity || 1)),
            color: item.color && item.color.toString().trim() !== '' && item.color !== 'null' 
                ? item.color.toString().trim() 
                : null,
            size: item.size && item.size.toString().trim() !== '' && item.size !== 'null' 
                ? item.size.toString().trim() 
                : null
        };

        console.log('Cart API: Adding to cart:', cartData);
        
        try {
            const response = await apiRequest('/cart', {
                method: 'POST',  
                body: JSON.stringify(cartData)
            });
            
            // Backend returns success field, check it
            if (response.success !== true) {
                throw new Error(response.message || 'Failed to add item to cart');
            }

            Utils.showToast('Đã thêm sản phẩm vào giỏ hàng', 'success');
            
            // Update cart count in UI
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Cart API error:', error);
            
            // Extract meaningful error message
            let errorMessage = 'Lỗi khi thêm vào giỏ hàng';
            
            if (error.message.includes('không hợp lệ')) {
                errorMessage = 'Dữ liệu sản phẩm không hợp lệ';
            } else if (error.message.includes('tồn kho')) {
                errorMessage = error.message; // Use the stock error message directly
            } else if (error.message.includes('không tồn tại')) {
                errorMessage = 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh';
            } else if (error.message.includes('authenticated')) {
                errorMessage = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại';
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
            } else if (error.message.includes('connection') || error.message.includes('fetch')) {
                errorMessage = 'Lỗi kết nối, vui lòng thử lại';
            }
            
            Utils.showToast(errorMessage, 'error');
            throw error;
        }
    },

    // FIXED: Update cart item quantity with better error handling
    async updateCartItem(cartId, quantity, options = {}) {
        if (!cartId || isNaN(cartId)) {
            throw new Error('Cart ID không hợp lệ');
        }

        if (quantity < 0) {
            throw new Error('Số lượng phải lớn hơn 0');
        }

        const body = {
            quantity: parseInt(quantity)
        };
        
        // Add optional color and size if provided
        if (options.color) body.color = options.color;
        if (options.size) body.size = options.size;
        
        console.log('Cart API: Updating cart item:', { cartId, body });
        
        try {
            const response = await apiRequest(`/cart/${cartId}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            Utils.showToast(response.message || 'Đã cập nhật số lượng', 'success');
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Update cart item error:', error);
            
            let errorMessage = 'Lỗi khi cập nhật số lượng';
            if (error.message.includes('tồn kho')) {
                errorMessage = error.message;
            } else if (error.message.includes('không tồn tại')) {
                errorMessage = 'Sản phẩm không còn trong giỏ hàng';
            }
            
            Utils.showToast(errorMessage, 'error');
            throw error;
        }
    },

    // FIXED: Remove item from cart using DELETE method
    async removeCartItem(cartId) {
        if (!cartId || isNaN(cartId)) {
            throw new Error('Cart ID không hợp lệ');
        }

        console.log('Cart API: Removing cart item:', cartId);
        
        try {
            const response = await apiRequest(`/cart/${cartId}`, {
                method: 'DELETE'
            });

            Utils.showToast(response.message || 'Đã xóa sản phẩm khỏi giỏ hàng', 'success');
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Remove cart item error:', error);
            
            let errorMessage = 'Lỗi khi xóa sản phẩm';
            if (error.message.includes('không tồn tại')) {
                errorMessage = 'Sản phẩm không còn trong giỏ hàng';
            }
            
            Utils.showToast(errorMessage, 'error');
            throw error;
        }
    },

    // FIXED: Remove item by product details with better validation
    async removeFromCartByProduct(productId, options = {}) {
        if (!productId || isNaN(productId)) {
            throw new Error('Product ID không hợp lệ');
        }

        const body = {
            product_id: parseInt(productId)
        };
        
        // Add optional parameters with proper normalization
        if (options.color && options.color.toString().trim() !== '' && options.color !== 'null') {
            body.color = options.color.toString().trim();
        }
        if (options.size && options.size.toString().trim() !== '' && options.size !== 'null') {
            body.size = options.size.toString().trim();
        }
        
        console.log('Cart API: Removing from cart by product:', body);
        
        try {
            const response = await apiRequest('/cart', {
                method: 'DELETE',
                body: JSON.stringify(body)
            });

            Utils.showToast(response.message || 'Đã xóa sản phẩm khỏi giỏ hàng', 'success');
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Remove by product error:', error);
            
            let errorMessage = 'Lỗi khi xóa sản phẩm';
            if (error.message.includes('không tồn tại')) {
                errorMessage = 'Sản phẩm không còn trong giỏ hàng';
            }
            
            Utils.showToast(errorMessage, 'error');
            throw error;
        }
    },

    // Clear entire cart
    async clearCart() {
        const user = getUser();
        
        if (!user) {
            throw new Error('User not logged in');
        }

        try {
            const response = await apiRequest('/cart/clear', {
                method: 'POST'
            });
            
            Utils.showToast(response.message || 'Đã xóa tất cả sản phẩm khỏi giỏ hàng', 'success');
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Failed to clear cart:', error);
            Utils.showToast('Lỗi khi xóa giỏ hàng', 'error');
            throw error;
        }
    },

    // Get cart item count with error handling
    async getCartCount() {
        try {
            const user = getUser();
            if (!user) {
                return 0;
            }

            const response = await apiRequest('/cart/count');
            return response.total_items || 0;
        } catch (error) {
            console.error('Failed to get cart count:', error);
            return 0;
        }
    },

    // Update cart count in UI with error handling
    async updateCartCount() {
        try {
            const count = await this.getCartCount();
            const cartCountElements = document.querySelectorAll('.cart-count, .cart-badge, [data-cart-count]');
            
            cartCountElements.forEach(element => {
                element.textContent = count;
                element.style.display = count > 0 ? 'inline' : 'none';
            });

            // Dispatch custom event for cart count update
            window.dispatchEvent(new CustomEvent('cartCountUpdated', { 
                detail: { count } 
            }));
        } catch (error) {
            console.error('Failed to update cart count UI:', error);
        }
    },

    // Check if product is in cart
    async isInCart(productId, options = {}) {
        try {
            const cart = await this.getCart();
            return cart.items.some(item => 
                item.product_id === parseInt(productId) && 
                (!options.color || item.color === options.color) &&
                (!options.size || item.size === options.size)
            );
        } catch (error) {
            console.error('Failed to check if product is in cart:', error);
            return false;
        }
    },

    // Get specific cart item
    async getCartItem(productId, options = {}) {
        try {
            const cart = await this.getCart();
            return cart.items.find(item => 
                item.product_id === parseInt(productId) && 
                (!options.color || item.color === options.color) &&
                (!options.size || item.size === options.size)
            );
        } catch (error) {
            console.error('Failed to get cart item:', error);
            return null;
        }
    },

    // Validate cart before checkout
    async validateCart() {
        try {
            const cart = await this.getCart();
            const validationErrors = [];

            if (!cart.items || cart.items.length === 0) {
                validationErrors.push('Giỏ hàng trống');
                return { valid: false, errors: validationErrors };
            }

            // Check each item availability and stock
            for (const item of cart.items) {
                try {
                    const product = await productsAPI.getProduct(item.product_id);
                    
                    if (!product.is_active) {
                        validationErrors.push(`${product.name} không còn bán`);
                    }
                    
                    if (product.stock < item.quantity) {
                        validationErrors.push(`${product.name} không đủ hàng (còn: ${product.stock}, yêu cầu: ${item.quantity})`);
                    }
                } catch (error) {
                    validationErrors.push(`Không thể kiểm tra sản phẩm ${item.product_id}`);
                }
            }

            return {
                valid: validationErrors.length === 0,
                errors: validationErrors,
                cart
            };
        } catch (error) {
            console.error('Failed to validate cart:', error);
            return {
                valid: false,
                errors: ['Không thể kiểm tra giỏ hàng'],
                cart: null
            };
        }
    },

    // Sync guest cart with server cart after login
    async syncGuestCartWithServer() {
        try {
            const guestCart = this.getGuestCart();
            
            if (!guestCart.items || guestCart.items.length === 0) {
                console.log('No guest cart items to sync');
                return;
            }

            console.log('Syncing guest cart with server...', guestCart.items);

            const response = await apiRequest('/cart/sync', {
                method: 'POST',
                body: JSON.stringify({ items: guestCart.items })
            });

            console.log('Cart sync response:', response);

            // Clear guest cart after successful sync
            localStorage.removeItem(this.GUEST_CART_KEY);
            
            // Update cart count
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Failed to sync guest cart:', error);
            // Don't throw error here to avoid breaking login flow
        }
    },

    // Get guest cart from local storage
    getGuestCart() {
        try {
            const cart = localStorage.getItem(this.GUEST_CART_KEY);
            return cart ? JSON.parse(cart) : { items: [], total: 0, totalItems: 0 };
        } catch (error) {
            console.error('Error parsing guest cart:', error);
            return { items: [], total: 0, totalItems: 0 };
        }
    },

    // Save guest cart to local storage
    saveGuestCart(cart) {
        try {
            localStorage.setItem(this.GUEST_CART_KEY, JSON.stringify(cart));
        } catch (error) {
            console.error('Error saving guest cart:', error);
        }
    }
};
// Favorites API
const favoritesAPI = {
    async getFavorites() {
        return await apiRequest('/favorites');
    },

    async toggleFavorite(productId) { 
        return await apiRequest(`/favorites/${productId}`, {
            method: 'POST'
        });
    }
};

// Orders API
const ordersAPI = {
    async createOrder(orderData) {
        return await apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    },

    async getUserOrders(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return await apiRequest(`/orders/my-orders?${queryString}`);
    },

    async getOrder(id) {
        return await apiRequest(`/orders/${id}`);
    },

    async cancelOrder(id) {
        return await apiRequest(`/orders/${id}/cancel`, {
            method: 'PUT'
        });
    },

    // Admin functions
    async getAllOrders(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return await apiRequest(`/orders?${queryString}`);
    },

    async updateOrderStatus(id, status) {
        return await apiRequest(`/orders/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    },

    async getOrderStats() {
        return await apiRequest('/orders/admin/stats');
    }
};

// Promotions API
const promotionsAPI = {
    async getPromotions() {
        return await apiRequest('/promotions');
    },

    async validatePromotion(code, orderAmount) {
        return await apiRequest('/promotions/validate', {
            method: 'POST',
            body: JSON.stringify({ code, order_amount: orderAmount })
        });
    },

    async createPromotion(promotionData) {
        return await apiRequest('/promotions', {
            method: 'POST',
            body: JSON.stringify(promotionData)
        });
        }
};

// Admin API
const adminAPI = {
    async getAllUsers() {
        return await apiRequest('/users/all');
    },

    async updateUserRole(userId, role) {
        return await apiRequest('/users/role', {
            method: 'PUT',
            body: JSON.stringify({ userId, role })
        });
    }
};

// Utility functions for UI
const showLoading = (element) => {
    if (element) {
        element.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>Đang tải...</p>
            </div>
        `;
    }
};

const showError = (element, message) => {
    if (element) {
        element.innerHTML = `
            <div class="alert alert-error">
                <p>${message}</p>
            </div>
        `;
    }
};

const showSuccess = (element, message) => {
    if (element) {
        element.innerHTML = `
            <div class="alert alert-success">
                <p>${message}</p>
            </div>
        `;
    }
};

// Toast notifications
const showToast = (message, type = 'success') => {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-message">${message}</span>
            <button class="toast-close">&times;</button>
        </div>
    `;

    // Add toast styles
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 9999;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;

    // Add keyframe for animation
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .toast-content {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }
            .toast-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);

    // Manual close
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });
};

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
};

// Format date
const formatDate = (dateString) => {
    return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(dateString);
};

// Debounce function for search
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Initialize auth state
const initializeAuth = () => {
    const token = getToken();
    const user = getUser();
    
    // Update UI based on auth state
    updateAuthUI(user);
    
    return { token, user };
};

// Update UI based on authentication state
const updateAuthUI = (user) => {
    const userMenu = document.querySelector('.user-menu');
    const loginBtn = document.querySelector('.login-btn');
    const userBtn = document.querySelector('.user-btn');
    
    if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userBtn) {
            userBtn.style.display = 'flex';
            userBtn.querySelector('.username').textContent = user.username;
        }
        
        // Show admin link for admin users
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) {
            adminLink.style.display = user.role === 'admin' ? 'block' : 'none';
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'flex';
        if (userBtn) userBtn.style.display = 'none';
    }
};

// Export APIs for global use
window.API = {
    auth: authAPI,
    products: productsAPI,
    categories: categoriesAPI,
    cart: cartAPI,
    favorites: favoritesAPI,
    orders: ordersAPI,
    promotions: promotionsAPI,
    admin: adminAPI
};

// Export utilities
window.Utils = {
    showLoading,
    showError,
    showSuccess,
    showToast,
    formatCurrency,
    formatDate,
    debounce,
    initializeAuth,
    updateAuthUI,
    getToken,
    getUser,
    setAuth,
    clearAuth
};