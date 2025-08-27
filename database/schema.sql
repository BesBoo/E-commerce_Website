-- database/schema.sql

-- Tạo database
CREATE DATABASE ECommerceDB;
USE ECommerceDB;

-- Bảng users
CREATE TABLE users (
    user_id int IDENTITY(1,1) PRIMARY KEY,
    username nvarchar(50) UNIQUE NOT NULL,
    password_hash nvarchar(255) NOT NULL,
    email nvarchar(100) UNIQUE NOT NULL,
    phone nvarchar(20),
    full_name nvarchar(100),
    address nvarchar(255),
    role nvarchar(20) DEFAULT 'user',
    created_at datetime DEFAULT GETDATE(),
    updated_at datetime DEFAULT GETDATE()
);

-- Bảng categories
CREATE TABLE categories (
    category_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(100) NOT NULL,
    description nvarchar(255),
    image_url nvarchar(255),
    created_at datetime DEFAULT GETDATE()
);

-- Bảng products
CREATE TABLE products (
    product_id int IDENTITY(1,1) PRIMARY KEY,
    name nvarchar(100) NOT NULL,
    description nvarchar(max),
    price decimal(18,2) NOT NULL,
    stock int DEFAULT 0,
    category_id int,
    image_url nvarchar(255),
    images nvarchar(max), 
    colors nvarchar(255), 
    sizes nvarchar(255), 
    brand nvarchar(100),
    is_featured bit DEFAULT 0,
    is_new bit DEFAULT 0,
    discount_percent int DEFAULT 0,
    created_at datetime DEFAULT GETDATE(),
    updated_at datetime DEFAULT GETDATE(),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

-- Bảng orders
CREATE TABLE orders (
    order_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int,
    total_amount decimal(18,2) NOT NULL,
    shipping_address nvarchar(255),
    phone nvarchar(20),
    status nvarchar(20) DEFAULT 'pending', 
    payment_method nvarchar(50) DEFAULT 'COD',
    notes nvarchar(max),
    created_at datetime DEFAULT GETDATE(),
    updated_at datetime DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Bảng order_details
CREATE TABLE order_details (
    order_detail_id int IDENTITY(1,1) PRIMARY KEY,
    order_id int,
    product_id int,
    quantity int NOT NULL,
    price decimal(18,2) NOT NULL,
    color nvarchar(50),
    size nvarchar(20),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Bảng promotions
CREATE TABLE promotions (
    promotion_id int IDENTITY(1,1) PRIMARY KEY,
    code nvarchar(50) UNIQUE,
    discount_type nvarchar(20) DEFAULT 'percent', -- percent hoặc fixed
    discount_value int NOT NULL,
    min_order_amount decimal(18,2) DEFAULT 0,
    start_date datetime,
    end_date datetime,
    usage_limit int,
    used_count int DEFAULT 0,
    is_active bit DEFAULT 1,
    created_at datetime DEFAULT GETDATE()
);

-- Bảng reviews
CREATE TABLE reviews (
    review_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int,
    product_id int,
    rating int CHECK (rating BETWEEN 1 AND 5),
    comment nvarchar(max),
    created_at datetime DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Bảng favorites (sản phẩm yêu thích)
CREATE TABLE favorites (
    favorite_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int,
    product_id int,
    created_at datetime DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE(user_id, product_id)
);

-- Bảng cart (giỏ hàng)
CREATE TABLE cart (
    cart_id int IDENTITY(1,1) PRIMARY KEY,
    user_id int,
    product_id int,
    quantity int NOT NULL DEFAULT 1,
    color nvarchar(50),
    size nvarchar(20),
    created_at datetime DEFAULT GETDATE(),
    updated_at datetime DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Bảng content (nội dung trang)
CREATE TABLE content (
    content_id int IDENTITY(1,1) PRIMARY KEY,
    type nvarchar(50), -- about, policy, blog
    title nvarchar(200),
    content nvarchar(max),
    slug nvarchar(200),
    is_active bit DEFAULT 1,
    created_at datetime DEFAULT GETDATE(),
    updated_at datetime DEFAULT GETDATE()
);

-- Indexes để tối ưu performance
CREATE INDEX IX_products_category ON products(category_id);
CREATE INDEX IX_products_featured ON products(is_featured);
CREATE INDEX IX_products_new ON products(is_new);
CREATE INDEX IX_orders_user ON orders(user_id);
CREATE INDEX IX_orders_status ON orders(status);
CREATE INDEX IX_reviews_product ON reviews(product_id);
CREATE INDEX IX_cart_user ON cart(user_id);