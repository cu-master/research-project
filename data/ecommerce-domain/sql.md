-- 1. RESET: Drop tables if they exist (Fixes your error)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS addresses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- 2. SCHEMA: Create the tables
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    CONSTRAINT fk_customer_address FOREIGN KEY(customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    category_id INT,
    name VARCHAR(255) NOT NULL,
    stock INT DEFAULT 0,
    current_price DECIMAL(10, 2) NOT NULL, 
    CONSTRAINT fk_category FOREIGN KEY(category_id) REFERENCES categories(category_id) ON DELETE SET NULL
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    CONSTRAINT fk_customer_order FOREIGN KEY(customer_id) REFERENCES customers(customer_id) ON DELETE RESTRICT
);

CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL, 
    CONSTRAINT fk_order FOREIGN KEY(order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_product FOREIGN KEY(product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_payment FOREIGN KEY(order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

-- 3. SEED: Insert the Data
INSERT INTO categories (name, description) VALUES
('Electronics', 'Gadgets, computers, and accessories'),
('Clothing', 'Men and Women fashion'),
('Books', 'Physical and audio books');

INSERT INTO products (category_id, name, stock, current_price) VALUES
(1, 'Smartphone X', 50, 999.00),
(1, 'Wireless Headphones', 100, 199.50),
(1, '4K Monitor', 30, 450.00),
(2, 'Leather Jacket', 15, 120.00),
(2, 'Running Shoes', 60, 85.00),
(3, 'Learning SQL', 100, 45.00),
(3, 'The Art of War', 50, 15.00);

INSERT INTO customers (email, name) VALUES
('alice@example.com', 'Alice Smith'),
('bob@example.com', 'Bob Jones'),
('charlie@example.com', 'Charlie Day');

INSERT INTO addresses (customer_id, street, city) VALUES
(1, '123 Maple Ave', 'New York'),
(2, '456 Oak Lane', 'San Francisco'),
(3, '789 Pine St', 'London');

INSERT INTO orders (customer_id, total_amount, order_date) VALUES
(1, 1044.00, NOW() - INTERVAL '2 days'), 
(2, 85.00, NOW() - INTERVAL '1 day');    

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
(1, 1, 1, 999.00), 
(1, 6, 1, 45.00),
(2, 5, 1, 85.00); 

INSERT INTO payments (order_id, amount, payment_date) VALUES
(1, 1044.00, NOW() - INTERVAL '2 days'),
(2, 85.00, NOW() - INTERVAL '1 day');