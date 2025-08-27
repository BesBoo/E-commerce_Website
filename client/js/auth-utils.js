// auth-utils.js - Utility functions for authentication

// Authentication utilities
const AuthUtils = {
    
    // Route protection
    protectRoute(allowedRoles = []) {
        const user = Utils.getUser();
        const token = Utils.getToken();
        
        // Check if user is logged in
        if (!token || !user) {
            this.redirectToLogin();
            return false;
        }
        
        // Check role if specified
        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
            Utils.showToast('Bạn không có quyền truy cập trang này', 'error');
            window.location.href = '/client/index.html';
            return false;
        }
        
        return true;
    },
    
    // Redirect to login with current page as return URL
    redirectToLogin() {
        const currentPath = window.location.pathname + window.location.search;
        const loginUrl = `/client/login.html?redirect=${encodeURIComponent(currentPath)}`;
        window.location.href = loginUrl;
    },
    
    // Check if user has specific role
    hasRole(role) {
        const user = Utils.getUser();
        return user && user.role === role;
    },
    
    // Check if user has any of the specified roles
    hasAnyRole(roles) {
        const user = Utils.getUser();
        return user && roles.includes(user.role);
    },
    
    // Auto-logout when token expires
    setupTokenExpirationCheck() {
        const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        
        setInterval(async () => {
            if (Auth.isLoggedIn()) {
                try {
                    // Try to validate token by making an API call
                    await Auth.validateToken();
                } catch (error) {
                    console.warn('Token expired, logging out:', error);
                    this.handleTokenExpiration();
                }
            }
        }, checkInterval);
    },
    
    // Handle token expiration
    handleTokenExpiration() {
        Utils.clearAuth();
        Utils.showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
        
        // Redirect to login after a short delay
        setTimeout(() => {
            this.redirectToLogin();
        }, 2000);
    },
    
    // Setup auth state listeners
    setupAuthStateListener() {
        // Listen for storage changes (for multi-tab sync)
        window.addEventListener('storage', (e) => {
            if (e.key === 'token' || e.key === 'user') {
                const user = Utils.getUser();
                const token = Utils.getToken();
                
                // Update UI based on auth state
                Utils.updateAuthUI(user);
                
                // Redirect if logged out in another tab
                if (!token && this.isOnProtectedRoute()) {
                    window.location.reload();
                }
            }
        });
        
        // Listen for beforeunload to cleanup
        window.addEventListener('beforeunload', () => {
            // Cleanup any pending auth operations
        });
    },
    
    // Check if current route is protected
    isOnProtectedRoute() {
        const protectedRoutes = ['/profile', '/admin', '/orders', '/favorites'];
        const currentPath = window.location.pathname;
        return protectedRoutes.some(route => currentPath.startsWith(route));
    },
    
    // Format user display name
    getUserDisplayName(user = null) {
        const currentUser = user || Utils.getUser();
        if (!currentUser) return 'Khách';
        
        return currentUser.full_name || currentUser.username || 'User';
    },
    
    // Get user initials for avatar
    getUserInitials(user = null) {
        const currentUser = user || Utils.getUser();
        if (!currentUser) return '?';
        
        const name = currentUser.full_name || currentUser.username;
        if (!name) return '?';
        
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        } else {
            return name.substring(0, 2).toUpperCase();
        }
    },
    
    // Update navigation based on auth state
    updateNavigation() {
        const user = Utils.getUser();
        const isLoggedIn = Auth.isLoggedIn();
        
        // Update login/logout buttons
        const loginBtn = document.querySelector('.login-btn, .nav-login');
        const logoutBtn = document.querySelector('.logout-btn, .nav-logout');
        const userMenu = document.querySelector('.user-menu, .nav-user');
        
        if (isLoggedIn && user) {
            // Hide login button
            if (loginBtn) loginBtn.style.display = 'none';
            
            // Show logout button and user menu
            if (logoutBtn) {
                logoutBtn.style.display = 'block';
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleLogout();
                });
            }
            
            if (userMenu) {
                userMenu.style.display = 'block';
                this.updateUserMenu(userMenu, user);
            }
            
        } else {
            // Show login button
            if (loginBtn) loginBtn.style.display = 'block';
            
            // Hide logout button and user menu
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userMenu) userMenu.style.display = 'none';
        }
        
        // Update admin menu visibility
        const adminMenu = document.querySelector('.admin-menu, .nav-admin');
        if (adminMenu) {
            adminMenu.style.display = this.hasRole('admin') ? 'block' : 'none';
        }
    },
    
    // Update user menu content
    updateUserMenu(menuElement, user) {
        const userName = menuElement.querySelector('.user-name');
        const userEmail = menuElement.querySelector('.user-email');
        const userAvatar = menuElement.querySelector('.user-avatar');
        
        if (userName) {
            userName.textContent = this.getUserDisplayName(user);
        }
        
        if (userEmail) {
            userEmail.textContent = user.email;
        }
        
        if (userAvatar) {
            userAvatar.textContent = this.getUserInitials(user);
        }
    },
    
    // Handle logout with confirmation
    handleLogout(showConfirmation = true) {
        if (showConfirmation) {
            if (!confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                return;
            }
        }
        
        Auth.logout();
    },
    
    // Form validation helpers
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    validatePassword(password) {
        return password && password.length >= 6;
    },
    
    validateUsername(username) {
        return username && username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username);
    },
    
    validatePhone(phone) {
        const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
        return phoneRegex.test(phone.replace(/[\s\-]/g, ''));
    },
    
    // Generate secure password
    generateSecurePassword(length = 12) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        
        // Ensure at least one character from each required type
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*';
        
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];
        
        // Fill remaining length
        for (let i = password.length; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }
        
        // Shuffle password
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    },
    
    // Password strength checker
    checkPasswordStrength(password) {
        let score = 0;
        let feedback = [];
        
        if (!password) {
            return { score: 0, strength: 'Rất yếu', feedback: ['Vui lòng nhập mật khẩu'] };
        }
        
        // Length check
        if (password.length >= 8) score += 2;
        else if (password.length >= 6) score += 1;
        else feedback.push('Mật khẩu nên có ít nhất 8 ký tự');
        
        // Character type checks
        if (/[a-z]/.test(password)) score += 1;
        else feedback.push('Thêm chữ thường');
        
        if (/[A-Z]/.test(password)) score += 1;
        else feedback.push('Thêm chữ hoa');
        
        if (/[0-9]/.test(password)) score += 1;
        else feedback.push('Thêm số');
        
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;
        else feedback.push('Thêm ký tự đặc biệt');
        
        // Avoid common patterns
        if (!/(.)\1{2,}/.test(password)) score += 1;
        else feedback.push('Tránh lặp ký tự');
        
        // Determine strength level
        let strength;
        if (score >= 7) strength = 'Rất mạnh';
        else if (score >= 5) strength = 'Mạnh';
        else if (score >= 3) strength = 'Trung bình';
        else if (score >= 1) strength = 'Yếu';
        else strength = 'Rất yếu';
        
        return { score, strength, feedback };
    },
    
    // Create password strength indicator
    createPasswordStrengthIndicator(inputId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="password-strength">
                <div class="strength-bar">
                    <div class="strength-fill"></div>
                </div>
                <div class="strength-text"></div>
                <ul class="strength-feedback"></ul>
            </div>
        `;
        
        const input = document.getElementById(inputId);
        const strengthBar = container.querySelector('.strength-fill');
        const strengthText = container.querySelector('.strength-text');
        const strengthFeedback = container.querySelector('.strength-feedback');
        
        input.addEventListener('input', (e) => {
            const result = this.checkPasswordStrength(e.target.value);
            
            // Update bar
            const percentage = (result.score / 7) * 100;
            strengthBar.style.width = percentage + '%';
            
            // Update color
            let color;
            if (result.score >= 6) color = '#27ae60';
            else if (result.score >= 4) color = '#f39c12';
            else if (result.score >= 2) color = '#e67e22';
            else color = '#e74c3c';
            
            strengthBar.style.backgroundColor = color;
            
            // Update text
            strengthText.textContent = result.strength;
            strengthText.style.color = color;
            
            // Update feedback
            strengthFeedback.innerHTML = result.feedback
                .map(item => `<li>${item}</li>`)
                .join('');
        });
    },
    
    // Social login handlers
    handleFacebookLogin() {
        Utils.showToast('Đăng nhập Facebook sẽ được cập nhật sớm', 'info');
    },
    
    handleGoogleLogin() {
        Utils.showToast('Đăng nhập Google sẽ được cập nhật sớm', 'info');
    },
    
    // Remember me functionality
    handleRememberMe(username, remember) {
        if (remember && username) {
            localStorage.setItem('rememberedUsername', username);
        } else {
            localStorage.removeItem('rememberedUsername');
        }
    },
    
    getRememberedUsername() {
        return localStorage.getItem('rememberedUsername') || '';
    },
    
    // Initialize auth utilities
    initialize() {
        // Setup token expiration check
        this.setupTokenExpirationCheck();
        
        // Setup auth state listener
        this.setupAuthStateListener();
        
        // Update navigation
        this.updateNavigation();
        
        // Setup global logout handlers
        document.addEventListener('click', (e) => {
            if (e.target.matches('.logout-btn, .nav-logout')) {
                e.preventDefault();
                this.handleLogout();
            }
        });
        
        // Setup social login handlers
        document.addEventListener('click', (e) => {
            if (e.target.matches('.btn-social.facebook')) {
                e.preventDefault();
                this.handleFacebookLogin();
            } else if (e.target.matches('.btn-social.google')) {
                e.preventDefault();
                this.handleGoogleLogin();
            }
        });
    }
};

// CSS for password strength indicator
const passwordStrengthCSS = `
    .password-strength {
        margin-top: 8px;
    }
    
    .strength-bar {
        width: 100%;
        height: 6px;
        background: #e1e5e9;
        border-radius: 3px;
        overflow: hidden;
    }
    
    .strength-fill {
        height: 100%;
        width: 0%;
        background: #e74c3c;
        transition: all 0.3s ease;
        border-radius: 3px;
    }
    
    .strength-text {
        font-size: 12px;
        font-weight: 600;
        margin-top: 4px;
    }
    
    .strength-feedback {
        list-style: none;
        padding: 0;
        margin: 4px 0 0 0;
        font-size: 11px;
        color: #666;
    }
    
    .strength-feedback li {
        margin: 2px 0;
    }
`;

// Inject CSS
if (!document.getElementById('password-strength-styles')) {
    const style = document.createElement('style');
    style.id = 'password-strength-styles';
    style.textContent = passwordStrengthCSS;
    document.head.appendChild(style);
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    AuthUtils.initialize();
});

// Make AuthUtils available globally
window.AuthUtils = AuthUtils;