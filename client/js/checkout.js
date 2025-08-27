// client/js/checkout.js

// Checkout Manager - Quản lý thanh toán
const CheckoutManager = {
    checkoutData: null,
    
    // Khởi tạo trang checkout
    async initialize() {
        try {
            // Kiểm tra đăng nhập
            if (!Utils.getToken()) {
                Utils.showToast('Vui lòng đăng nhập để tiếp tục', 'error');
                window.location.href = '/login?redirect=/checkout';
                return;
            }

            // Lấy dữ liệu checkout từ sessionStorage hoặc API
            this.loadCheckoutData();
            
            if (!this.checkoutData || !this.checkoutData.items || this.checkoutData.items.length === 0) {
                Utils.showToast('Không có sản phẩm để thanh toán', 'error');
                window.location.href = '/cart';
                return;
            }

            // Load thông tin user
            await this.loadUserInfo();
            
            // Render order summary
            this.renderOrderSummary();
            
            // Setup event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Initialize checkout error:', error);
            Utils.showToast('Lỗi khi tải trang thanh toán', 'error');
            window.location.href = '/cart';
        }
    },

    // Load dữ liệu checkout
    loadCheckoutData() {
        try {
            const savedData = sessionStorage.getItem('checkoutData');
            if (savedData) {
                this.checkoutData = JSON.parse(savedData);
            } else {
                // Fallback: lấy từ cart nếu không có trong sessionStorage
                const cartData = localStorage.getItem('cart');
                if (cartData) {
                    const cart = JSON.parse(cartData);
                    this.checkoutData = {
                        items: cart.items || [],
                        subtotal: cart.subtotal || 0,
                        discount: cart.discount || 0,
                        discountCode: cart.discountCode || null,
                        total: cart.total || 0
                    };
                }
            }
        } catch (error) {
            console.error('Load checkout data error:', error);
            this.checkoutData = null;
        }
    },

    // Load thông tin user và điền vào form
    async loadUserInfo() {
        try {
            const user = Utils.getUser();
            if (!user) return;

            // Điền thông tin user vào form
            const fullNameInput = document.getElementById('fullName');
            const phoneInput = document.getElementById('phone');
            const emailInput = document.getElementById('email');
            const addressInput = document.getElementById('address');

            if (fullNameInput && user.full_name) {
                fullNameInput.value = user.full_name;
            }
            
            if (phoneInput && user.phone) {
                phoneInput.value = user.phone;
            }
            
            if (emailInput && user.email) {
                emailInput.value = user.email;
            }
            
            if (addressInput && user.address) {
                addressInput.value = user.address;
            }

            // Lấy thông tin profile mới nhất từ server
            try {
                const profile = await API.auth.getProfile();
                if (profile.user) {
                    if (fullNameInput) fullNameInput.value = profile.user.full_name || '';
                    if (phoneInput) phoneInput.value = profile.user.phone || '';
                    if (emailInput) emailInput.value = profile.user.email || '';
                    if (addressInput) addressInput.value = profile.user.address || '';
                }
            } catch (error) {
                console.warn('Could not load latest profile:', error);
            }
        } catch (error) {
            console.error('Load user info error:', error);
        }
    },

    // Render order summary
    renderOrderSummary() {
        const orderItems = document.getElementById('orderItems');
        const orderTotals = document.getElementById('orderTotals');
        
        if (!orderItems || !orderTotals || !this.checkoutData) return;

        // Render items
        orderItems.innerHTML = this.checkoutData.items.map(item => {
            const finalPrice = item.price * (1 - (item.discount_percent || 0) / 100);
            const itemTotal = finalPrice * item.quantity;

            return `
                <div class="order-item">
                    <div class="order-item-image">
                        <img src="${item.image_url || '/images/placeholder.jpg'}" 
                             alt="${item.name}" onerror="this.src='/images/placeholder.jpg'">
                    </div>
                    <div class="order-item-info">
                        <div class="order-item-name">${item.name}</div>
                        <div class="order-item-details">
                            ${item.color ? `Màu: ${item.color}` : ''}
                            ${item.color && item.size ? ' | ' : ''}
                            ${item.size ? `Size: ${item.size}` : ''}
                            <br>Số lượng: ${item.quantity}
                        </div>
                        <div class="order-item-price">${Utils.formatCurrency(itemTotal)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Tính phí vận chuyển
        const shipping = this.checkoutData.subtotal >= 500000 ? 0 : 30000;
        const finalTotal = this.checkoutData.total + shipping;

        // Render totals
        orderTotals.innerHTML = `
            <div class="total-row">
                <span>Tạm tính:</span>
                <span>${Utils.formatCurrency(this.checkoutData.subtotal)}</span>
            </div>
            
            ${this.checkoutData.discount > 0 ? `
                <div class="total-row">
                    <span>Giảm giá (${this.checkoutData.discountCode}):</span>
                    <span style="color: #27ae60;">-${Utils.formatCurrency(this.checkoutData.discount)}</span>
                </div>
            ` : ''}
            
            <div class="total-row">
                <span>Phí vận chuyển:</span>
                <span>${shipping === 0 ? 'Miễn phí' : Utils.formatCurrency(shipping)}</span>
            </div>
            
            <div class="total-row final">
                <span>Tổng cộng:</span>
                <span>${Utils.formatCurrency(finalTotal)}</span>
            </div>
        `;

        // Update checkout data với shipping
        this.checkoutData.shipping = shipping;
        this.checkoutData.finalTotal = finalTotal;
    },

    // Setup event listeners
    setupEventListeners() {
        // Payment method selection
        const paymentMethods = document.querySelectorAll('.payment-method');
        paymentMethods.forEach(method => {
            method.addEventListener('click', () => {
                paymentMethods.forEach(m => m.classList.remove('selected'));
                method.classList.add('selected');
                
                const radio = method.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
            });
        });

        // Form validation
        const form = document.getElementById('checkoutForm');
        const inputs = form.querySelectorAll('input, textarea');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });

        // Phone number formatting
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length > 11) {
                    value = value.substring(0, 11);
                }
                e.target.value = value;
            });
        }
    },

    // Validate individual field
    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.name;
        let isValid = true;
        let errorMessage = '';

        // Clear previous errors
        this.clearFieldError(field);

        // Required validation
        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = 'Trường này là bắt buộc';
        }

        // Specific validations
        if (value && isValid) {
            switch (fieldName) {
                case 'fullName':
                    if (value.length < 2) {
                        isValid = false;
                        errorMessage = 'Họ tên phải có ít nhất 2 ký tự';
                    }
                    break;
                    
                case 'phone':
                    const phoneRegex = /^[0-9]{10,11}$/;
                    if (!phoneRegex.test(value)) {
                        isValid = false;
                        errorMessage = 'Số điện thoại phải có 10-11 chữ số';
                    }
                    break;
                    
                case 'email':
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (value && !emailRegex.test(value)) {
                        isValid = false;
                        errorMessage = 'Email không hợp lệ';
                    }
                    break;
                    
                case 'address':
                    if (value.length < 10) {
                        isValid = false;
                        errorMessage = 'Địa chỉ phải có ít nhất 10 ký tự';
                    }
                    break;
            }
        }

        // Show error if invalid
        if (!isValid) {
            this.showFieldError(field, errorMessage);
        }

        return isValid;
    },

    // Show field error
    showFieldError(field, message) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;

        formGroup.classList.add('error');
        
        let errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    },

    // Clear field error
    clearFieldError(field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;

        formGroup.classList.remove('error');
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    },

    // Validate entire form
    validateForm() {
        const form = document.getElementById('checkoutForm');
        const requiredFields = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    },

    // Đặt hàng
    async placeOrder() {
        try {
            // Validate form
            if (!this.validateForm()) {
                Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
                return;
            }

            const form = document.getElementById('checkoutForm');
            const formData = new FormData(form);
            const placeOrderBtn = document.getElementById('placeOrderBtn');
            
            // Disable button
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

            // Prepare order data
            const orderData = {
                items: this.checkoutData.items,
                shipping_address: formData.get('address'),
                phone: formData.get('phone'),
                notes: formData.get('notes') || '',
                payment_method: formData.get('paymentMethod') || 'COD',
                promotion_code: this.checkoutData.discountCode || null
            };

            // Place order
            const response = await API.cart.checkout(orderData);

            // Success
            Utils.showToast('Đặt hàng thành công!');
            
            // Clear checkout data
            sessionStorage.removeItem('checkoutData');
            localStorage.removeItem('cart');
            
            // Redirect to success page
            setTimeout(() => {
                window.location.href = `/order-success?orderId=${response.order_id}`;
            }, 1500);

        } catch (error) {
            console.error('Place order error:', error);
            Utils.showToast(error.message || 'Lỗi khi đặt hàng', 'error');
            
            // Re-enable button
            const placeOrderBtn = document.getElementById('placeOrderBtn');
            placeOrderBtn.disabled = false;
            placeOrderBtn.innerHTML = '<i class="fas fa-lock"></i> Đặt hàng ngay';
        }
    },

    // Quay lại giỏ hàng
    backToCart() {
        window.location.href = '/cart';
    }
};

// Initialize khi trang load
document.addEventListener('DOMContentLoaded', async () => {
    await CheckoutManager.initialize();
});

// Export cho global use
window.CheckoutManager = CheckoutManager;