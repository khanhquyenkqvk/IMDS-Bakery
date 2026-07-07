USE bakery_inventory;

-- ========================
-- 1. Roles & Users
-- ========================
INSERT INTO Roles (role_name) VALUES
('Owner'), ('Employee'), ('Admin');

INSERT INTO Users (username, password_hash, email, phone, role_id) VALUES
('owner1', 'hash_pw1', 'owner1@mail.com', '0901111111', 1), -- Owner
('emp1', 'hash_pw2', 'emp1@mail.com', '0902222222', 2),     -- Employee
('emp2', 'hash_pw3', 'emp2@mail.com', '0903333333', 2),     -- Employee
('admin1', 'hash_pw4', 'admin1@mail.com', '0904444444', 3); -- Admin

-- ========================
-- 2. Ingredients
-- ========================
INSERT INTO Ingredients (name, unit, shelf_life_days) VALUES
('Bột mì', 'kg', 180),
('Đường trắng', 'kg', 365),
('Bơ lạt', 'kg', 90),
('Sữa tươi', 'l', 10),
('Bột cacao', 'kg', 200);

-- ========================
-- 3. Batches (lô nhập kho)
-- ========================
INSERT INTO Batches (ingredient_id, lot_code, quantity, unit, manufacture_date, expiry_date, status, created_by) VALUES
(1, 'LOT001', 100, 'kg', '2025-09-01', '2026-03-01', 'Valid', 4), -- Bột mì
(2, 'LOT002', 50, 'kg', '2025-09-05', '2026-09-05', 'Valid', 4),  -- Đường
(3, 'LOT003', 30, 'kg', '2025-09-10', '2025-12-10', 'Valid', 4),  -- Bơ
(4, 'LOT004', 20, 'l',  '2025-09-20', '2025-09-30', 'Valid', 4),  -- Sữa
(5, 'LOT005', 10, 'kg', '2025-09-15', '2026-03-15', 'Valid', 4);  -- Cacao

-- ========================
-- 4. Inventory (tồn kho)
-- ========================
INSERT INTO Inventory (ingredient_id, current_stock, unit) VALUES
(1, 100, 'kg'),
(2, 50, 'kg'),
(3, 30, 'kg'),
(4, 20, 'l'),
(5, 10, 'kg');

-- ========================
-- 5. Menu & Recipes
-- ========================
INSERT INTO Menu (name, description, created_by) VALUES
('Bánh mì ngọt', 'Bánh mì ngọt cơ bản', 1),
('Bánh kem bơ', 'Bánh kem dùng bơ và sữa', 1),
('Bánh sô-cô-la', 'Bánh cacao phủ sô-cô-la', 1);

INSERT INTO Recipes (menu_id, approved_by) VALUES
(1, 1),
(2, 1),
(3, 1);

INSERT INTO Recipe_Ingredients (recipe_id, ingredient_id, quantity, unit) VALUES
-- Bánh mì ngọt
(1, 1, 0.5, 'kg'),
(1, 2, 0.1, 'kg'),
-- Bánh kem bơ
(2, 1, 0.3, 'kg'),
(2, 3, 0.2, 'kg'),
(2, 4, 0.5, 'l'),
-- Bánh sô-cô-la
(3, 1, 0.4, 'kg'),
(3, 5, 0.2, 'kg'),
(3, 2, 0.1, 'kg');

-- ========================
-- 6. Transactions (nhập - xuất - dùng)
-- ========================
INSERT INTO Transactions (batch_id, type, quantity, unit, created_by, note) VALUES
(1, 'Import', 100, 'kg', 4, 'Nhập bột mì ban đầu'),
(2, 'Import', 50, 'kg', 4, 'Nhập đường ban đầu'),
(3, 'Import', 30, 'kg', 4, 'Nhập bơ ban đầu'),
(4, 'Import', 20, 'l',  4, 'Nhập sữa ban đầu'),
(5, 'Import', 10, 'kg', 4, 'Nhập bột cacao ban đầu'),
(1, 'Use', 5, 'kg', 2, 'Làm bánh mì ngọt'),
(4, 'Use', 2, 'l', 2, 'Làm bánh kem bơ'),
(5, 'Use', 1, 'kg', 2, 'Làm bánh sô-cô-la');

-- ========================
-- 7. Opened Packages (mở bao bì)
-- ========================
INSERT INTO Opened_Packages (batch_id, opened_date, new_expiry_date, handled_by) VALUES
(3, '2025-09-25', '2025-10-25', 2);

-- ========================
-- 8. Alerts & Waste Reports
-- ========================
INSERT INTO Alerts (batch_id, alert_type, severity, status) VALUES
(4, 'NearExpiry', 'Yellow', 'Pending'),
(3, 'Expired', 'Red', 'Pending');

INSERT INTO Waste_Reports (batch_id, reported_by, reason, quantity, unit) VALUES
(3, 2, 'Bơ bị hỏng, chảy nước', 1, 'kg'),
(4, 2, 'Sữa để quá hạn', 1, 'l');

-- ========================
-- 9. Forecasts & Suggestions
-- ========================
INSERT INTO Forecasts (ingredient_id, forecast_type, predicted_quantity, unit, forecast_date) VALUES
(1, 'Weekly', 60, 'kg', '2025-10-01'),
(2, 'Weekly', 20, 'kg', '2025-10-01'),
(4, 'Weekly', 15, 'l', '2025-10-01');

INSERT INTO Suggestions (suggestion_type, details, status, approved_by) VALUES
('Menu', 'Thêm Bánh Trung Thu cho dịp Tết Trung Thu', 'Pending', 1),
('Recipe_Substitute', 'Thiếu bơ, thay bằng dầu thực vật', 'Approved', 1),
('Purchase', 'Mua thêm 20kg bột mì chuẩn bị cho lễ 20/10', 'Pending', 1);

-- ========================
-- 10. Production Reports
-- ========================
INSERT INTO Production_Reports (menu_id, produced_quantity, report_date) VALUES
(1, 100, '2025-09-25'),
(2, 50, '2025-09-25'),
(3, 30, '2025-09-25');
