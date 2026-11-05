BEGIN TRANSACTION;
CREATE TABLE core_company (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_code TEXT UNIQUE NOT NULL,
        legal_name TEXT NOT NULL,
        business_category TEXT,
        tax_number TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "core_company" VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','MARKA-LOGISTIK','PT Marka Logistik Indonesia','Logistics, Freight & Supply Chain','03.881.992.1-512.000','ACTIVE','2026-11-05 04:46:13');
CREATE TABLE core_tenant (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "core_tenant" VALUES('00000000-0000-0000-0000-000000000001','MARKA_LOGISTIK','Marka Logistik Multi-Tenant System','ACTIVE','2026-11-05 04:46:13');
CREATE TABLE crm_lead (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_id TEXT NOT NULL REFERENCES core_company(id),
        client_name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        cargo_type TEXT,
        route_origin TEXT,
        route_destination TEXT,
        estimated_value REAL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT 'PROPOSAL', -- LEAD, QUALIFIED, PROPOSAL, WON, LOST
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "crm_lead" VALUES('lead-001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PT Indofood Sukses Makmur','Ibu Rina S.','081234567890','rina.s@indofood.co.id','Bahan Baku & Dry Food','Surabaya','Semarang & Cikarang',850000000.0,'WON','2026-11-05 04:46:13');
INSERT INTO "crm_lead" VALUES('lead-002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PT Mayora Indah Tbk','Pak Joko W.','081987654321','joko.w@mayora.co.id','FMCG Biscuits & Confectionery','Tangerang','Surabaya & Malang',420000000.0,'PROPOSAL','2026-11-05 04:46:13');
INSERT INTO "crm_lead" VALUES('lead-003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CV Berkah Logistik Nusantara','Pak Hendro','085678901234','hendro@berkahlogistik.id','Distribusi Sparepart Traktor','Gresik','Banjarmasin',160000000.0,'QUALIFIED','2026-11-05 04:46:13');
CREATE TABLE fin_invoice (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_id TEXT NOT NULL REFERENCES core_company(id),
        invoice_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        issue_date DATE,
        due_date DATE,
        subtotal REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'UNPAID', -- PAID, UNPAID, OVERDUE
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "fin_invoice" VALUES('inv-001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','INV-MLG/2026/001','PT Indofood Sukses Makmur','2026-10-15','2026-11-15',85000000.0,9350000.0,94350000.0,'PAID','2026-11-05 04:46:13');
INSERT INTO "fin_invoice" VALUES('inv-002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','INV-MLG/2026/002','PT Semen Indonesia Logistik','2026-10-28','2026-11-28',145000000.0,15950000.0,160950000.0,'UNPAID','2026-11-05 04:46:13');
INSERT INTO "fin_invoice" VALUES('inv-003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','INV-MLG/2026/003','PT Pelabuhan Indonesia (Pelindo)','2026-11-01','2026-11-20',32000000.0,3520000.0,35520000.0,'UNPAID','2026-11-05 04:46:13');
CREATE TABLE iam_role (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        role_code TEXT NOT NULL,
        role_name TEXT NOT NULL,
        description TEXT
    );
INSERT INTO "iam_role" VALUES('r-super-admin','00000000-0000-0000-0000-000000000001','ROLE-SUPER-ADMIN','Super Administrator','Global System Governance & Module Setup');
INSERT INTO "iam_role" VALUES('r-company-admin','00000000-0000-0000-0000-000000000001','ROLE-COMPANY-ADMIN','Company Administrator','User and Company Level Administration');
INSERT INTO "iam_role" VALUES('r-director','00000000-0000-0000-0000-000000000001','ROLE-DIRECTOR','Executive Director','Executive Approvals & Business Strategy');
INSERT INTO "iam_role" VALUES('r-om','00000000-0000-0000-0000-000000000001','ROLE-OM','Operational Manager','Logistics Fleet Operations & Project Oversight');
INSERT INTO "iam_role" VALUES('r-pm','00000000-0000-0000-0000-000000000001','ROLE-PM','Project Manager','Logistics Project & Task Management');
INSERT INTO "iam_role" VALUES('r-finance','00000000-0000-0000-0000-000000000001','ROLE-FINANCE','Finance Controller','Billing, Ledger, Invoicing & Freight Settlement');
INSERT INTO "iam_role" VALUES('r-crm','00000000-0000-0000-0000-000000000001','ROLE-CRM-LEAD','CRM & Commercial Lead','Freight Quotations, Client Accounts & Deals');
INSERT INTO "iam_role" VALUES('r-staff','00000000-0000-0000-0000-000000000001','ROLE-STAFF','Operational Staff','Field Dispatch, Tracking Verification & Routine DO');
CREATE TABLE iam_user (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_id TEXT REFERENCES core_company(id),
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_superuser BOOLEAN DEFAULT 0,
        active_role_code TEXT NOT NULL,
        enabled_modules TEXT, -- JSON array of strings
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "iam_user" VALUES('u-admin','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin@markalogistik.com','admin','System Super Administrator','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',1,'ROLE-SUPER-ADMIN','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-director','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','director@markalogistik.com','director','Hendra Wijaya (Executive Director)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-DIRECTOR','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-om','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','om@markalogistik.com','melika.om','Melika Citra Tania (Ops Manager)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-OM','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-pm','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','pm@markalogistik.com','arof.pm','Arof Fudding (Project Manager)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-PM','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-finance','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','finance@markalogistik.com','sarah.fin','Sarah Amanda (Finance Controller)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-FINANCE','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-crm','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','sales@markalogistik.com','rian.crm','Rian Destianto (CRM & Commercial Lead)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-CRM-LEAD','["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"]','ACTIVE','2026-11-05 04:46:13');
INSERT INTO "iam_user" VALUES('u-staff','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','staff@markalogistik.com','budi.ops','Budi Pratama (Field Dispatcher)','$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe',0,'ROLE-STAFF','["DASHBOARD", "TASKS", "REQUESTS", "RESOURCES"]','ACTIVE','2026-11-05 04:46:13');
CREATE TABLE iam_user_role (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES iam_user(id),
        role_id TEXT NOT NULL REFERENCES iam_role(id)
    );
CREATE TABLE prj_project (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_id TEXT NOT NULL REFERENCES core_company(id),
        project_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        priority TEXT DEFAULT 'HIGH',
        start_date DATE,
        end_date DATE,
        budget REAL DEFAULT 0,
        spent REAL DEFAULT 0,
        manager_name TEXT,
        progress_percentage INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "prj_project" VALUES('prj-001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PRJ-MLG-001','Distribusi Logistik Semen Curah Jalur Pantura','Ekspedisi logistik distribusi semen curah 25.000 ton Surabaya - Cirebon','IN_PROGRESS','HIGH','2026-01-10','2026-06-30',450000000.0,185000000.0,'Arof Fudding',55,'2026-11-05 04:46:13');
INSERT INTO "prj_project" VALUES('prj-002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PRJ-MLG-002','Pengadaan & Integrasi Fleet GPS Tracker Marka','Implementasi IoT real-time vehicle telematics pada 80 unit armada tronton','IN_PROGRESS','CRITICAL','2026-02-01','2026-04-15',180000000.0,92000000.0,'Melika Citra',70,'2026-11-05 04:46:13');
INSERT INTO "prj_project" VALUES('prj-003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PRJ-MLG-003','Audit Cold Storage & Gudang Logistik Surabaya','Optimalisasi sistem cold storage logistik perikanan dan rantai beku','PLANNING','MEDIUM','2026-03-01','2026-07-31',95000000.0,12000000.0,'Arof Fudding',20,'2026-11-05 04:46:13');
INSERT INTO "prj_project" VALUES('prj-004','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PRJ-MLG-004','Charter Kargo Kapal Roro Surabaya - Makassar','Pengiriman kontainer komoditas FMCG rute pelabuhan Tanjung Perak - Soekarno Hatta Makassar','COMPLETED','HIGH','2026-01-05','2026-02-28',320000000.0,310000000.0,'Hendra Wijaya',100,'2026-11-05 04:46:13');
CREATE TABLE req_request (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_id TEXT NOT NULL REFERENCES core_company(id),
        request_number TEXT UNIQUE NOT NULL,
        request_type TEXT NOT NULL, -- FUEL, FLEET_MAINTENANCE, TRAVEL, MATERIAL
        title TEXT NOT NULL,
        description TEXT,
        amount REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
        requester_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "req_request" VALUES('req-001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','REQ-BBM-2026-001','FUEL','Permintaan BBM Solar Armada Logistik Pantura','Pengisian solar industri armada 12 unit tronton perjalanan rute pulang pergi',14500000.0,'APPROVED','Budi Pratama','2026-11-05 04:46:13');
INSERT INTO "req_request" VALUES('req-002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','REQ-MAINT-2026-002','FLEET_MAINTENANCE','Penggantian Kampas Rem & Ban Luar Unit Hino 500','Maintenance berkala armada truk B 9122 MLG sebelum dinas jarak jauh',8600000.0,'PENDING','Budi Pratama','2026-11-05 04:46:13');
INSERT INTO "req_request" VALUES('req-003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','REQ-TRAVEL-2026-003','TRAVEL','Uang Jalan Pengemudi Ekspedisi Surabaya - Cirebon','Alokasi tol Trans Jawa, uang makan, dan retribusi jembatan timbang',6200000.0,'APPROVED','Arof Fudding','2026-11-05 04:46:13');
CREATE TABLE sys_notification (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        user_id TEXT REFERENCES iam_user(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        category TEXT DEFAULT 'INFO',
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "sys_notification" VALUES('notif-001','00000000-0000-0000-0000-000000000001','u-pm','Armada Hino B 9122 MLG Tiba di Tujuan','Unit telah sampai di Gudang Distribusi Cirebon pukul 08:30 WIB dengan aman.','FLEET',0,'2026-11-05 04:46:13');
INSERT INTO "sys_notification" VALUES('notif-002','00000000-0000-0000-0000-000000000001','u-om','Approval Request BBM Diperlukan','Permintaan BBM Solar Rp 14.500.000 menunggu verifikasi Manajer Operasional.','APPROVAL',0,'2026-11-05 04:46:13');
INSERT INTO "sys_notification" VALUES('notif-003','00000000-0000-0000-0000-000000000001','u-finance','Invoice INV-MLG/2026/002 Jatuh Tempo','Tagihan PT Semen Indonesia Logistik sebesar Rp 160.950.000 jatuh tempo dalam 7 hari.','FINANCE',0,'2026-11-05 04:46:13');
CREATE TABLE tsk_task (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES prj_project(id),
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        task_code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'TODO', -- TODO, IN_PROGRESS, REVIEW, DONE
        priority TEXT DEFAULT 'MEDIUM',
        assignee_name TEXT,
        due_date DATE,
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "tsk_task" VALUES('tsk-001','prj-001','00000000-0000-0000-0000-000000000001','TSK-001','Monitoring Status Armada Tronton 12 Unit','Pastikan seluruh surat jalan (DO) terverifikasi sebelum keberangkatan','IN_PROGRESS','HIGH','Budi Pratama','2026-11-10',60,'2026-11-05 04:46:13');
INSERT INTO "tsk_task" VALUES('tsk-002','prj-001','00000000-0000-0000-0000-000000000001','TSK-002','Rekonsiliasi Timbangan Muatan di Pelabuhan','Pengecekan selisih timbangan semen curah di depot muat','DONE','MEDIUM','Budi Pratama','2026-11-04',100,'2026-11-05 04:46:13');
INSERT INTO "tsk_task" VALUES('tsk-003','prj-002','00000000-0000-0000-0000-000000000001','TSK-003','Pemasangan Sensor Suhu & GPS OBD-II','Instalasi perangkat telematika pada armada batch 2','IN_PROGRESS','CRITICAL','Tim Teknis IoT','2026-11-15',45,'2026-11-05 04:46:13');
INSERT INTO "tsk_task" VALUES('tsk-004','prj-003','00000000-0000-0000-0000-000000000001','TSK-004','Inspeksi Kompresor Cold Storage Depot B','Uji kalibrasi sensor temperatur -20 derajat Celsius','TODO','HIGH','Budi Pratama','2026-11-20',0,'2026-11-05 04:46:13');
INSERT INTO "tsk_task" VALUES('tsk-005','prj-004','00000000-0000-0000-0000-000000000001','TSK-005','Penyelesaian Berita Acara Serah Terima (BAST)','Dokumen BAST kontainer pelabuhan Makassar telah ditandatangani','DONE','MEDIUM','Melika Citra','2026-02-28',100,'2026-11-05 04:46:13');
COMMIT;
