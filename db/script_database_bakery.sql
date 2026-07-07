-- ========================
-- DATABASE CREATION
-- ========================
CREATE DATABASE IF NOT EXISTS bakery_inventory;
USE bakery_inventory;

-- ========================
-- USER & ROLE
-- ========================
CREATE TABLE Roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(20) NOT NULL
);

CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    role_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    FOREIGN KEY (role_id) REFERENCES Roles(role_id)
);

-- ========================
-- INGREDIENT & INVENTORY
-- ========================
CREATE TABLE Ingredients (
    ingredient_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    shelf_life_days INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Batches (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id INT NOT NULL,
    lot_code VARCHAR(50) UNIQUE NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    manufacture_date DATE,
    expiry_date DATE,
    status ENUM('Valid','NearExpiry','Expired','Opened','UsedUp') DEFAULT 'Valid',
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ingredient_id) REFERENCES Ingredients(ingredient_id),
    FOREIGN KEY (created_by) REFERENCES Users(user_id)
);

CREATE TABLE Inventory (
    inventory_id INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id INT NOT NULL,
    current_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ingredient_id) REFERENCES Ingredients(ingredient_id)
);

-- ========================
-- MENU & RECIPE
-- ========================
CREATE TABLE Menu (
    menu_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES Users(user_id)
);

CREATE TABLE Recipes (
    recipe_id INT AUTO_INCREMENT PRIMARY KEY,
    menu_id INT NOT NULL,
    approved_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_id) REFERENCES Menu(menu_id),
    FOREIGN KEY (approved_by) REFERENCES Users(user_id)
);

CREATE TABLE Recipe_Ingredients (
    recipe_ingredient_id INT AUTO_INCREMENT PRIMARY KEY,
    recipe_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES Recipes(recipe_id),
    FOREIGN KEY (ingredient_id) REFERENCES Ingredients(ingredient_id)
);

-- ========================
-- TRANSACTIONS
-- ========================
CREATE TABLE Transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    type ENUM('Import','Export','Use','Waste','Adjust') NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    FOREIGN KEY (batch_id) REFERENCES Batches(batch_id),
    FOREIGN KEY (created_by) REFERENCES Users(user_id)
);

CREATE TABLE Opened_Packages (
    opened_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    opened_date DATE,
    new_expiry_date DATE,
    handled_by INT,
    FOREIGN KEY (batch_id) REFERENCES Batches(batch_id),
    FOREIGN KEY (handled_by) REFERENCES Users(user_id)
);

-- ========================
-- ALERTS & WASTE
-- ========================
CREATE TABLE Alerts (
    alert_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    alert_type ENUM('NearExpiry','Expired','LowStock','Waste') NOT NULL,
    severity ENUM('Yellow','Red') NOT NULL,
    status ENUM('Pending','Resolved') DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by INT,
    FOREIGN KEY (batch_id) REFERENCES Batches(batch_id),
    FOREIGN KEY (resolved_by) REFERENCES Users(user_id)
);

CREATE TABLE Waste_Reports (
    waste_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    reported_by INT,
    reason TEXT,
    quantity DECIMAL(10,2),
    unit VARCHAR(20),
    report_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES Batches(batch_id),
    FOREIGN KEY (reported_by) REFERENCES Users(user_id)
);

-- ========================
-- FORECASTS & SUGGESTIONS
-- ========================
CREATE TABLE Forecasts (
    forecast_id INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id INT NOT NULL,
    forecast_type ENUM('Weekly','Monthly','Trend') NOT NULL,
    predicted_quantity DECIMAL(10,2),
    unit VARCHAR(20),
    forecast_date DATE,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ingredient_id) REFERENCES Ingredients(ingredient_id)
);

CREATE TABLE Suggestions (
    suggestion_id INT AUTO_INCREMENT PRIMARY KEY,
    suggestion_type ENUM('Menu','Recipe_Substitute','Purchase') NOT NULL,
    details TEXT,
    status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by INT,
    FOREIGN KEY (approved_by) REFERENCES Users(user_id)
);

CREATE TABLE Production_Reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    menu_id INT NOT NULL,
    produced_quantity INT NOT NULL,
    report_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_id) REFERENCES Menu(menu_id)
);
