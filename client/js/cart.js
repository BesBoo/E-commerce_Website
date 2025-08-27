// client/js/cart.js - FIXED VERSION

// Cart Manager - Quản lý giỏ hàng
const CartManager = {
    cart: {
        items: [],
        total: 0,
        discount: 0,
        discountCode: null
    },
    
    // Khởi tạo cart
    async initialize() {
        try {
            // Tải giỏ hàng từ server nếu user đã đăng nhập
            if (Utils.getToken()) {
                await this.loadCartFromServer();
            } else {
                // Tải từ localStorage nếu chưa đăng nhập
                this.loadCartFromStorage();
            }
            
            this.renderCart();
            this.updateCartCount();
        } catch (error) {
            console.error('Initialize cart error:', error);
            // Fallback to localStorage
            this.loadCartFromStorage();
            this.renderCart();
            this.updateCartCount();
        }
    },

    // Tải giỏ hàng từ server
    async loadCartFromServer() {
        try {
            const response = await API.cart.getCart();
            this.cart.items = response.items || [];
            this.calculateTotal();
        } catch (error) {
            console.error('Load cart from server error:', error);
            throw error;
        }
    },

    // Tải giỏ hàng từ localStorage
    loadCartFromStorage() {
        try {
            const savedCart = localStorage.getItem('cart');
            if (savedCart) {
                const parsedCart = JSON.parse(savedCart);
                this.cart = { ...this.cart, ...parsedCart };
            }
            this.calculateTotal();
        } catch (error) {
            console.error('Load cart from storage error:', error);
            this.cart = { items: [], total: 0, discount: 0, discountCode: null };
        }
    },

    // Lưu giỏ hàng vào localStorage
    saveCartToStorage() {
        try {
            localStorage.setItem('cart', JSON.stringify(this.cart));
        } catch (error) {
            console.error('Save cart to storage error:', error);
        }
    },

    // Thêm sản phẩm vào giỏ
    async addItem(product, quantity = 1, options = {}) {
        try {
            const { color, size } = options;

            // Sync với server nếu đã đăng nhập
            if (Utils.getToken()) {
                await API.cart.addToCart({
                    product_id: product.product_id,
                    quantity: quantity,
                    color: color,
                    size: size
                });
                
                // FIXED: Reload cart từ server để đồng bộ dữ liệu
                await this.loadCartFromServer();
            } else {
                // Local cart logic cho guest user
                const existingItemIndex = this.cart.items.findIndex(item => 
                    item.product_id === product.product_id && 
                    item.color === color && 
                    item.size === size
                );

                if (existingItemIndex !== -1) {
                    // Cập nhật số lượng nếu đã có
                    this.cart.items[existingItemIndex].quantity += quantity;
                } else {
                    // Thêm mới nếu chưa có
                    const cartItem = {
                        product_id: product.product_id,
                        name: product.name,
                        price: product.price,
                        image_url: product.image_url,
                        color: color || null,
                        size: size || null,
                        quantity: quantity,
                        discount_percent: product.discount_percent || 0
                    };
                    this.cart.items.push(cartItem);
                }
            }

            this.calculateTotal();
            this.saveCartToStorage();
            this.renderCart();
            this.updateCartCount();
            
            Utils.showToast(`Đã thêm ${product.name} vào giỏ hàng`);
            return true;
        } catch (error) {
            console.error('Add item to cart error:', error);
            Utils.showToast('Lỗi khi thêm sản phẩm vào giỏ hàng', 'error');
            return false;
        }
    },

    // FIXED: Cập nhật số lượng sản phẩm
    async updateQuantity(productId, quantity, options = {}) {
        try {
            const { color, size } = options;
            
            const itemIndex = this.cart.items.findIndex(item => 
                item.product_id === productId && 
                item.color === (color || null) && 
                item.size === (size || null)
            );

            if (itemIndex === -1) {
                throw new Error('Sản phẩm không tồn tại trong giỏ hàng');
            }

            if (quantity <= 0) {
                return this.removeItem(productId, options);
            }

            // Sync với server nếu đã đăng nhập
            if (Utils.getToken()) {
                try {
                    console.log('Updating quantity using direct update method');
                    
                    // Try direct update method first (if backend supports it)
                    if (window.API.cart.updateQuantityDirect) {
                        try {
                            await window.API.cart.updateQuantityDirect(productId, quantity, {
                                color: color || null,
                                size: size || null
                            });
                            console.log('Successfully updated quantity via direct method');
                        } catch (directError) {
                            console.log('Direct method failed, using remove+add method');
                            
                            // Fallback to remove + add method
                            await API.cart.removeFromCart(productId, { 
                                color: color || null, 
                                size: size || null 
                            });
                            
                            // Add with new quantity
                            await API.cart.addToCart({
                                product_id: productId,
                                quantity: quantity,
                                color: color || null,
                                size: size || null
                            });
                            
                            console.log('Successfully updated quantity via remove+add method');
                        }
                    } else {
                        // Use remove + add method as fallback
                        console.log('Using remove+add method');
                        
                        await API.cart.removeFromCart(productId, { 
                            color: color || null, 
                            size: size || null 
                        });
                        
                        await API.cart.addToCart({
                            product_id: productId,
                            quantity: quantity,
                            color: color || null,
                            size: size || null
                        });
                        
                        console.log('Successfully updated quantity via remove+add method');
                    }
                    
                    // FIXED: Reload cart từ server để đồng bộ dữ liệu
                    await this.loadCartFromServer();
                    
                } catch (serverError) {
                    console.error('Server update failed:', serverError);
                    throw new Error(`Không thể cập nhật số lượng: ${serverError.message}`);
                }
            } else {
                // Chỉ update local nếu không đăng nhập
                this.cart.items[itemIndex].quantity = quantity;
            }

            this.calculateTotal();
            this.saveCartToStorage();
            this.renderCart();
            this.updateCartCount();
            
            return true;
        } catch (error) {
            console.error('Update quantity error:', error);
            Utils.showToast(error.message || 'Lỗi khi cập nhật số lượng', 'error');
            return false;
        }
    },

    // FIXED: Xóa sản phẩm khỏi giỏ
    async removeItem(productId, options = {}) {
        try {
            const { color, size } = options;
            
            console.log('=== DEBUG REMOVE ITEM ===');
            console.log('Removing productId:', productId);
            console.log('Color:', color);
            console.log('Size:', size);
            console.log('Current cart items:', this.cart.items);
            
            const itemIndex = this.cart.items.findIndex(item => {
                const match = item.product_id === productId && 
                            item.color === (color || null) && 
                            item.size === (size || null);
                console.log('Checking item:', item, 'Match:', match);
                return match;
            });

            console.log('Found item index:', itemIndex);

            if (itemIndex === -1) {
                throw new Error('Sản phẩm không tồn tại trong giỏ hàng');
            }

            const removedItem = this.cart.items[itemIndex];
            console.log('Removing item:', removedItem);

            // Sync với server trước khi xóa local
            if (Utils.getToken()) {
                try {
                    await API.cart.removeFromCart(productId, { color, size });
                    console.log('Successfully removed from server');
                    
                    // FIXED: Reload cart từ server để đồng bộ dữ liệu
                    await this.loadCartFromServer();
                } catch (serverError) {
                    console.error('Server remove error:', serverError);
                    // Vẫn tiếp tục xóa local nếu server lỗi
                    this.cart.items.splice(itemIndex, 1);
                }
            } else {
                // Xóa khỏi local cart cho guest user
                this.cart.items.splice(itemIndex, 1);
            }

            this.calculateTotal();
            this.saveCartToStorage();
            this.renderCart();
            this.updateCartCount();
            
            Utils.showToast(`Đã xóa ${removedItem.name} khỏi giỏ hàng`);
            console.log('=== END DEBUG REMOVE ===');
            return true;
        } catch (error) {
            console.error('Remove item error:', error);
            Utils.showToast('Lỗi khi xóa sản phẩm', 'error');
            return false;
        }
    },

    // Xóa tất cả sản phẩm
    async clearCart() {
        try {
            if (!confirm('Bạn có chắc chắn muốn xóa tất cả sản phẩm trong giỏ hàng?')) {
                return false;
            }

            // Sync với server
            if (Utils.getToken()) {
                await API.cart.clearCart();
                // FIXED: Reload cart từ server để đồng bộ dữ liệu
                await this.loadCartFromServer();
            } else {
                // Clear local cart cho guest user
                this.cart.items = [];
                this.cart.discount = 0;
                this.cart.discountCode = null;
            }

            this.calculateTotal();
            this.saveCartToStorage();
            this.renderCart();
            this.updateCartCount();
            
            Utils.showToast('Đã xóa tất cả sản phẩm khỏi giỏ hàng');
            return true;
        } catch (error) {
            console.error('Clear cart error:', error);
            Utils.showToast('Lỗi khi xóa giỏ hàng', 'error');
            return false;
        }
    },

    // Tính tổng tiền
    calculateTotal() {
        let subtotal = 0;
        
        this.cart.items.forEach(item => {
            const itemPrice = item.price;
            const discountAmount = item.discount_percent ? 
                (itemPrice * item.discount_percent / 100) : 0;
            const finalPrice = itemPrice - discountAmount;
            subtotal += finalPrice * item.quantity;
        });

        this.cart.subtotal = subtotal;
        this.cart.total = subtotal - this.cart.discount;
        
        if (this.cart.total < 0) {
            this.cart.total = 0;
        }
    },

    // Áp dụng mã giảm giá
    async applyDiscount(discountCode) {
        try {
            if (!discountCode || !discountCode.trim()) {
                Utils.showToast('Vui lòng nhập mã giảm giá', 'error');
                return false;
            }

            const response = await API.promotions.validatePromotion(
                discountCode.trim(), 
                this.cart.subtotal
            );

            if (response.valid) {
                this.cart.discountCode = discountCode.trim();
                this.cart.discount = response.discount_amount;
                this.calculateTotal();
                this.renderCart();
                
                Utils.showToast(`Áp dụng mã giảm giá thành công! Giảm ${Utils.formatCurrency(response.discount_amount)}`);
                return true;
            } else {
                Utils.showToast(response.message || 'Mã giảm giá không hợp lệ', 'error');
                return false;
            }
        } catch (error) {
            console.error('Apply discount error:', error);
            Utils.showToast('Lỗi khi áp dụng mã giảm giá', 'error');
            return false;
        }
    },

    // Xóa mã giảm giá
    removeDiscount() {
        this.cart.discountCode = null;
        this.cart.discount = 0;
        this.calculateTotal();
        this.renderCart();
        Utils.showToast('Đã xóa mã giảm giá');
    },

    // Render giỏ hàng
    renderCart() {
        const cartContent = document.getElementById('cartContent');
        const totalItems = document.getElementById('totalItems');
        
        if (!cartContent) return;

        // Cập nhật số lượng sản phẩm
        const itemCount = this.cart.items.reduce((total, item) => total + item.quantity, 0);
        if (totalItems) {
            totalItems.textContent = `${itemCount} sản phẩm`;
        }

        if (this.cart.items.length === 0) {
            this.renderEmptyCart(cartContent);
            return;
        }

        cartContent.innerHTML = `
            <div class="cart-items">
                ${this.cart.items.map(item => this.renderCartItem(item)).join('')}
            </div>
            <div class="cart-summary">
                ${this.renderCartSummary()}
            </div>
        `;

        // Thêm cart actions nếu có template
        const cartActionsTemplate = document.getElementById('cartActionsTemplate');
        if (cartActionsTemplate) {
            const cartActions = cartActionsTemplate.cloneNode(true);
            cartActions.id = 'cartActions';
            cartActions.style.display = 'flex';
            cartContent.insertBefore(cartActions, cartContent.firstChild);
        }

        // Setup event listeners
        this.setupCartEventListeners();
    },

    // Render sản phẩm trong giỏ
    renderCartItem(item) {
        const originalPrice = item.price;
        const discountAmount = item.discount_percent ? 
            (originalPrice * item.discount_percent / 100) : 0;
        const finalPrice = originalPrice - discountAmount;
        const itemTotal = finalPrice * item.quantity;

        return `
            <div class="cart-item" data-product-id="${item.product_id}" 
                 data-color="${item.color || ''}" data-size="${item.size || ''}">
                <div class="cart-item-image">
                    <img src="${item.image_url || '/images/placeholder.jpg'}" 
                         alt="${item.name}" onerror="this.src='/images/placeholder.jpg'">
                </div>
                
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    ${item.color ? `<p><strong>Màu:</strong> ${item.color}</p>` : ''}
                    ${item.size ? `<p><strong>Size:</strong> ${item.size}</p>` : ''}
                    <p><strong>Thương hiệu:</strong> ${item.brand || 'N/A'}</p>
                </div>
                
                <div class="cart-item-price">
                    <div class="original-price">${Utils.formatCurrency(finalPrice)}</div>
                    ${item.discount_percent > 0 ? 
                        `<div class="discounted-price">${Utils.formatCurrency(originalPrice)}</div>` : 
                        ''
                    }
                </div>
                
                <div class="quantity-controls">
                    <button class="quantity-btn decrease-btn" 
                            onclick="CartManager.updateItemQuantity(${item.product_id}, ${item.quantity - 1}, '${item.color || ''}', '${item.size || ''}')">
                        <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="99"
                           onchange="CartManager.updateItemQuantity(${item.product_id}, this.value, '${item.color || ''}', '${item.size || ''}')">
                    <button class="quantity-btn increase-btn"
                            onclick="CartManager.updateItemQuantity(${item.product_id}, ${item.quantity + 1}, '${item.color || ''}', '${item.size || ''}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="cart-item-total">
                    ${Utils.formatCurrency(itemTotal)}
                </div>
                
                <button class="remove-btn" 
                        onclick="CartManager.removeCartItem(${item.product_id}, '${item.color || ''}', '${item.size || ''}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    },

    // Render tóm tắt giỏ hàng
    renderCartSummary() {
        const shipping = this.cart.subtotal >= 500000 ? 0 : 30000; // Free shipping cho đơn hàng >= 500k
        const finalTotal = this.cart.total + shipping;

        return `
            <h3 class="summary-title">Tóm tắt đơn hàng</h3>
            
            <div class="summary-row">
                <span>Tạm tính:</span>
                <span>${Utils.formatCurrency(this.cart.subtotal)}</span>
            </div>
            
            ${this.cart.discount > 0 ? `
                <div class="summary-row">
                    <span>Giảm giá (${this.cart.discountCode}):</span>
                    <span style="color: #27ae60;">-${Utils.formatCurrency(this.cart.discount)}</span>
                </div>
            ` : ''}
            
            <div class="summary-row">
                <span>Phí vận chuyển:</span>
                <span>${shipping === 0 ? 'Miễn phí' : Utils.formatCurrency(shipping)}</span>
            </div>
            
            <div class="summary-row total">
                <span>Tổng cộng:</span>
                <span>${Utils.formatCurrency(finalTotal)}</span>
            </div>

            <div class="discount-code">
                <label for="discountInput"><strong>Mã giảm giá:</strong></label>
                <div class="discount-input-group">
                    <input type="text" id="discountInput" class="discount-input" 
                           placeholder="Nhập mã giảm giá" value="${this.cart.discountCode || ''}">
                    <button class="apply-discount-btn" onclick="CartManager.applyDiscountCode()">
                        Áp dụng
                    </button>
                </div>
                ${this.cart.discountCode ? `
                    <button style="margin-top: 10px; background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 14px;"
                            onclick="CartManager.removeDiscount()">
                        <i class="fas fa-times"></i> Xóa mã giảm giá
                    </button>
                ` : ''}
            </div>

            <button class="checkout-btn" onclick="CartManager.proceedToCheckout()" 
                    ${this.cart.items.length === 0 ? 'disabled' : ''}>
                <i class="fas fa-credit-card"></i>
                Tiến hành thanh toán
            </button>
        `;
    },

    // Render giỏ hàng trống
    renderEmptyCart(container) {
        const emptyCartTemplate = document.getElementById('emptyCartTemplate');
        if (emptyCartTemplate) {
            container.innerHTML = emptyCartTemplate.innerHTML;
        } else {
            container.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart" style="font-size: 4rem; color: #ccc;"></i>
                    <h3>Giỏ hàng trống</h3>
                    <p>Hãy thêm sản phẩm vào giỏ hàng để tiếp tục mua sắm</p>
                    <a href="/" class="btn btn-primary">Tiếp tục mua sắm</a>
                </div>
            `;
        }
    },

    // Setup event listeners
    setupCartEventListeners() {
        // Quantity input validation
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('input', (e) => {
                let value = parseInt(e.target.value);
                if (isNaN(value) || value < 1) {
                    e.target.value = 1;
                } else if (value > 99) {
                    e.target.value = 99;
                }
            });
        });

        // Discount input enter key
        const discountInput = document.getElementById('discountInput');
        if (discountInput) {
            discountInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.applyDiscountCode();
                }
            });
        }
    },

    // FIXED: Cập nhật số lượng sản phẩm từ UI
    async updateItemQuantity(productId, newQuantity, color = '', size = '') {
        console.log('=== DEBUG UPDATE QUANTITY ===');
        console.log('ProductId:', productId);
        console.log('New Quantity:', newQuantity);
        console.log('Color:', color);
        console.log('Size:', size);
        console.log('Current cart items:', this.cart.items);
        
        const quantity = parseInt(newQuantity);
        if (isNaN(quantity) || quantity < 0) {
            Utils.showToast('Số lượng không hợp lệ', 'error');
            this.renderCart(); // Re-render để reset UI
            return;
        }

        // Chuẩn hóa color và size
        const normalizedColor = (color === '' || color === 'null') ? null : color;
        const normalizedSize = (size === '' || size === 'null') ? null : size;
        
        console.log('Normalized color:', normalizedColor);
        console.log('Normalized size:', normalizedSize);

        const success = await this.updateQuantity(productId, quantity, { 
            color: normalizedColor, 
            size: normalizedSize 
        });
        
        console.log('Update result:', success);
        console.log('=== END DEBUG ===');
    },

    // FIXED: Xóa sản phẩm từ UI  
    async removeCartItem(productId, color = '', size = '') {
        await this.removeItem(productId, { 
            color: color || null, 
            size: size || null 
        });
    },

    // Áp dụng mã giảm giá từ UI
    async applyDiscountCode() {
        const discountInput = document.getElementById('discountInput');
        if (!discountInput) return;

        const code = discountInput.value.trim();
        await this.applyDiscount(code);
    },

    // Cập nhật số lượng sản phẩm trong header
    updateCartCount() {
        const cartCount = document.getElementById('cartCount');
        const headerCartCount = document.querySelector('.cart-btn .badge');
        
        const totalItems = this.cart.items.reduce((total, item) => total + item.quantity, 0);
        
        if (cartCount) cartCount.textContent = totalItems;
        if (headerCartCount) headerCartCount.textContent = totalItems;
    },

    // Chuyển đến trang thanh toán
    proceedToCheckout() {
        if (this.cart.items.length === 0) {
            Utils.showToast('Giỏ hàng đang trống', 'error');
            return;
        }

        // Kiểm tra đăng nhập
        if (!Utils.getToken()) {
            Utils.showToast('Vui lòng đăng nhập để tiếp tục', 'error');
            window.location.href = '/login?redirect=/checkout';
            return;
        }

        // Lưu thông tin checkout vào sessionStorage
        sessionStorage.setItem('checkoutData', JSON.stringify({
            items: this.cart.items,
            subtotal: this.cart.subtotal,
            discount: this.cart.discount,
            discountCode: this.cart.discountCode,
            total: this.cart.total
        }));

        window.location.href = '/checkout';
    },

    // Sync giỏ hàng khi đăng nhập
    async syncCartAfterLogin() {
        try {
            // Lấy giỏ hàng từ localStorage
            const localCart = JSON.parse(localStorage.getItem('cart') || '{"items":[]}');
            
            if (localCart.items && localCart.items.length > 0) {
                // Đồng bộ từng sản phẩm lên server
                for (const item of localCart.items) {
                    await API.cart.addToCart({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        color: item.color,
                        size: item.size
                    });
                }
                
                // Xóa localStorage cart sau khi sync
                localStorage.removeItem('cart');
                Utils.showToast('Đã đồng bộ giỏ hàng của bạn');
            }

            // Tải lại giỏ hàng từ server
            await this.loadCartFromServer();
            this.renderCart();
            this.updateCartCount();
        } catch (error) {
            console.error('Sync cart after login error:', error);
        }
    }
};

// Quick add to cart function (có thể gọi từ các trang khác)
window.addToCart = async (product, quantity = 1, options = {}) => {
    return await CartManager.addItem(product, quantity, options);
};

// Khởi tạo khi trang load
document.addEventListener('DOMContentLoaded', async () => {
    await CartManager.initialize();
});

// Listen for login/logout events
window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
        if (e.newValue) {
            // User logged in
            CartManager.syncCartAfterLogin();
        } else {
            // User logged out - reload cart from localStorage
            CartManager.loadCartFromStorage();
            CartManager.renderCart();
            CartManager.updateCartCount();
        }
    }
});

// FIXED API CART METHODS - Thêm vào cuối file api.js

// Sửa lại một số methods trong cartAPI
if (window.API && window.API.cart) {
    // Override updateCartItem method - FIXED
    window.API.cart.updateCartItem = async function(cartId, quantity, options = {}) {
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
    };

    // Override removeFromCart method - FIXED: Use request body instead of query params
    window.API.cart.removeFromCart = async function(productId, options = {}) {
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
    };

    // FIXED: Add a more reliable update quantity method
    window.API.cart.updateQuantityDirect = async function(productId, quantity, options = {}) {
        if (!productId || isNaN(productId)) {
            throw new Error('Product ID không hợp lệ');
        }

        if (quantity < 1) {
            throw new Error('Số lượng phải lớn hơn 0');
        }

        const body = {
            product_id: parseInt(productId),
            quantity: parseInt(quantity)
        };
        
        // Add optional parameters with proper normalization
        if (options.color && options.color.toString().trim() !== '' && options.color !== 'null') {
            body.color = options.color.toString().trim();
        }
        if (options.size && options.size.toString().trim() !== '' && options.size !== 'null') {
            body.size = options.size.toString().trim();
        }
        
        console.log('Cart API: Updating quantity directly:', body);
        
        try {
            const response = await apiRequest('/cart/update-quantity', {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            Utils.showToast(response.message || 'Đã cập nhật số lượng', 'success');
            await this.updateCartCount();
            
            return response;
        } catch (error) {
            console.error('Update quantity direct error:', error);
            
            let errorMessage = 'Lỗi khi cập nhật số lượng';
            if (error.message.includes('tồn kho')) {
                errorMessage = error.message;
            } else if (error.message.includes('không tồn tại')) {
                errorMessage = 'Sản phẩm không còn trong giỏ hàng';
            }
            
            Utils.showToast(errorMessage, 'error');
            throw error;
        }
    };
}

// Export CartManager for global use
window.CartManager = CartManager;