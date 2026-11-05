"""
Database Generator untuk Uji Coba ERP Marka Logistik
Menghasilkan trial_erp.db (SQLite) dan trial_dummy_seed.sql
Lengkap dengan multi-tenant, user berbagai role, project logistik, task, request, CRM, invoice, dan notifikasi dummy.
"""

import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "trial_erp.db")
SQL_PATH = os.path.join(os.path.dirname(__file__), "trial_dummy_seed.sql")

def create_and_seed_database():
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Aktifkan Foreign Keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Schema Definition
    cursor.executescript("""
    -- 1. Tenants
    CREATE TABLE IF NOT EXISTS core_tenant (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Companies
    CREATE TABLE IF NOT EXISTS core_company (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        company_code TEXT UNIQUE NOT NULL,
        legal_name TEXT NOT NULL,
        business_category TEXT,
        tax_number TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Roles
    CREATE TABLE IF NOT EXISTS iam_role (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        role_code TEXT NOT NULL,
        role_name TEXT NOT NULL,
        description TEXT
    );

    -- 4. Users
    CREATE TABLE IF NOT EXISTS iam_user (
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

    -- 5. User Roles Mapping
    CREATE TABLE IF NOT EXISTS iam_user_role (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES iam_user(id),
        role_id TEXT NOT NULL REFERENCES iam_role(id)
    );

    -- 6. Projects
    CREATE TABLE IF NOT EXISTS prj_project (
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

    -- 7. Tasks
    CREATE TABLE IF NOT EXISTS tsk_task (
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

    -- 8. Requests (Material, Operational, Approval)
    CREATE TABLE IF NOT EXISTS req_request (
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

    -- 9. CRM Leads / Inquiries
    CREATE TABLE IF NOT EXISTS crm_lead (
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

    -- 10. Finance Invoices & Transactions
    CREATE TABLE IF NOT EXISTS fin_invoice (
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

    -- 11. Notifications
    CREATE TABLE IF NOT EXISTS sys_notification (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES core_tenant(id),
        user_id TEXT REFERENCES iam_user(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        category TEXT DEFAULT 'INFO',
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Insert Initial Dummy Data
    tenant_id = "00000000-0000-0000-0000-000000000001"
    comp_id = "10000000-0000-0000-0000-000000000001"

    # Tenant
    cursor.execute("""
    INSERT INTO core_tenant (id, code, name, status)
    VALUES (?, 'MARKA_LOGISTIK', 'Marka Logistik Multi-Tenant System', 'ACTIVE');
    """, (tenant_id,))

    # Company
    cursor.execute("""
    INSERT INTO core_company (id, tenant_id, company_code, legal_name, business_category, tax_number, status)
    VALUES (?, ?, 'MARKA-LOGISTIK', 'PT Marka Logistik Indonesia', 'Logistics, Freight & Supply Chain', '03.881.992.1-512.000', 'ACTIVE');
    """, (comp_id, tenant_id))

    # Roles
    roles = [
        ("r-super-admin", "ROLE-SUPER-ADMIN", "Super Administrator", "Global System Governance & Module Setup"),
        ("r-company-admin", "ROLE-COMPANY-ADMIN", "Company Administrator", "User and Company Level Administration"),
        ("r-director", "ROLE-DIRECTOR", "Executive Director", "Executive Approvals & Business Strategy"),
        ("r-om", "ROLE-OM", "Operational Manager", "Logistics Fleet Operations & Project Oversight"),
        ("r-pm", "ROLE-PM", "Project Manager", "Logistics Project & Task Management"),
        ("r-finance", "ROLE-FINANCE", "Finance Controller", "Billing, Ledger, Invoicing & Freight Settlement"),
        ("r-crm", "ROLE-CRM-LEAD", "CRM & Commercial Lead", "Freight Quotations, Client Accounts & Deals"),
        ("r-staff", "ROLE-STAFF", "Operational Staff", "Field Dispatch, Tracking Verification & Routine DO"),
    ]
    for r_id, r_code, r_name, r_desc in roles:
        cursor.execute("INSERT INTO iam_role VALUES (?, ?, ?, ?, ?);", (r_id, tenant_id, r_code, r_name, r_desc))

    # All module list
    all_modules = json.dumps(["DASHBOARD", "PROJECTS", "TASKS", "REQUESTS", "FINANCE", "CRM", "INVENTORY", "REPORTING", "ADMINISTRATION", "RESOURCES", "MARBOT"])

    # Users (Password default: DummyPass123! - bcrypt hash)
    # $2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe
    pwd_hash = "$2b$10$wN9P31XyqSjJ2j8gq3g7yOBK0.P2Q0X7E7.9y50t4kP8I2q6c2Xfe"

    users = [
        ("u-admin", "admin@markalogistik.com", "admin", "System Super Administrator", 1, "ROLE-SUPER-ADMIN", all_modules),
        ("u-director", "director@markalogistik.com", "director", "Hendra Wijaya (Executive Director)", 0, "ROLE-DIRECTOR", all_modules),
        ("u-om", "om@markalogistik.com", "melika.om", "Melika Citra Tania (Ops Manager)", 0, "ROLE-OM", all_modules),
        ("u-pm", "pm@markalogistik.com", "arof.pm", "Arof Fudding (Project Manager)", 0, "ROLE-PM", all_modules),
        ("u-finance", "finance@markalogistik.com", "sarah.fin", "Sarah Amanda (Finance Controller)", 0, "ROLE-FINANCE", all_modules),
        ("u-crm", "sales@markalogistik.com", "rian.crm", "Rian Destianto (CRM & Commercial Lead)", 0, "ROLE-CRM-LEAD", all_modules),
        ("u-staff", "staff@markalogistik.com", "budi.ops", "Budi Pratama (Field Dispatcher)", 0, "ROLE-STAFF", json.dumps(["DASHBOARD", "TASKS", "REQUESTS", "RESOURCES"])),
    ]

    for u_id, email, username, name, is_super, active_role, mods in users:
        cursor.execute("""
        INSERT INTO iam_user (id, tenant_id, company_id, email, username, full_name, password_hash, is_superuser, active_role_code, enabled_modules, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE');
        """, (u_id, tenant_id, comp_id, email, username, name, pwd_hash, is_super, active_role, mods))

    # Dummy Projects
    projects = [
        ("prj-001", "PRJ-MLG-001", "Distribusi Logistik Semen Curah Jalur Pantura", "Ekspedisi logistik distribusi semen curah 25.000 ton Surabaya - Cirebon", "IN_PROGRESS", "HIGH", "2026-01-10", "2026-06-30", 450000000, 185000000, "Arof Fudding", 55),
        ("prj-002", "PRJ-MLG-002", "Pengadaan & Integrasi Fleet GPS Tracker Marka", "Implementasi IoT real-time vehicle telematics pada 80 unit armada tronton", "IN_PROGRESS", "CRITICAL", "2026-02-01", "2026-04-15", 180000000, 92000000, "Melika Citra", 70),
        ("prj-003", "PRJ-MLG-003", "Audit Cold Storage & Gudang Logistik Surabaya", "Optimalisasi sistem cold storage logistik perikanan dan rantai beku", "PLANNING", "MEDIUM", "2026-03-01", "2026-07-31", 95000000, 12000000, "Arof Fudding", 20),
        ("prj-004", "PRJ-MLG-004", "Charter Kargo Kapal Roro Surabaya - Makassar", "Pengiriman kontainer komoditas FMCG rute pelabuhan Tanjung Perak - Soekarno Hatta Makassar", "COMPLETED", "HIGH", "2026-01-05", "2026-02-28", 320000000, 310000000, "Hendra Wijaya", 100),
    ]

    for p in projects:
        cursor.execute("""
        INSERT INTO prj_project (id, tenant_id, company_id, project_code, name, description, status, priority, start_date, end_date, budget, spent, manager_name, progress_percentage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (p[0], tenant_id, comp_id, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]))

    # Dummy Tasks
    tasks = [
        ("tsk-001", "prj-001", "TSK-001", "Monitoring Status Armada Tronton 12 Unit", "Pastikan seluruh surat jalan (DO) terverifikasi sebelum keberangkatan", "IN_PROGRESS", "HIGH", "Budi Pratama", "2026-11-10", 60),
        ("tsk-002", "prj-001", "TSK-002", "Rekonsiliasi Timbangan Muatan di Pelabuhan", "Pengecekan selisih timbangan semen curah di depot muat", "DONE", "MEDIUM", "Budi Pratama", "2026-11-04", 100),
        ("tsk-003", "prj-002", "TSK-003", "Pemasangan Sensor Suhu & GPS OBD-II", "Instalasi perangkat telematika pada armada batch 2", "IN_PROGRESS", "CRITICAL", "Tim Teknis IoT", "2026-11-15", 45),
        ("tsk-004", "prj-003", "TSK-004", "Inspeksi Kompresor Cold Storage Depot B", "Uji kalibrasi sensor temperatur -20 derajat Celsius", "TODO", "HIGH", "Budi Pratama", "2026-11-20", 0),
        ("tsk-005", "prj-004", "TSK-005", "Penyelesaian Berita Acara Serah Terima (BAST)", "Dokumen BAST kontainer pelabuhan Makassar telah ditandatangani", "DONE", "MEDIUM", "Melika Citra", "2026-02-28", 100),
    ]

    for t in tasks:
        cursor.execute("""
        INSERT INTO tsk_task (id, project_id, tenant_id, task_code, title, description, status, priority, assignee_name, due_date, progress)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (t[0], t[1], tenant_id, t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9]))

    # Dummy Requests
    requests = [
        ("req-001", "REQ-BBM-2026-001", "FUEL", "Permintaan BBM Solar Armada Logistik Pantura", "Pengisian solar industri armada 12 unit tronton perjalanan rute pulang pergi", 14500000, "APPROVED", "Budi Pratama"),
        ("req-002", "REQ-MAINT-2026-002", "FLEET_MAINTENANCE", "Penggantian Kampas Rem & Ban Luar Unit Hino 500", "Maintenance berkala armada truk B 9122 MLG sebelum dinas jarak jauh", 8600000, "PENDING", "Budi Pratama"),
        ("req-003", "REQ-TRAVEL-2026-003", "TRAVEL", "Uang Jalan Pengemudi Ekspedisi Surabaya - Cirebon", "Alokasi tol Trans Jawa, uang makan, dan retribusi jembatan timbang", 6200000, "APPROVED", "Arof Fudding"),
    ]

    for req in requests:
        cursor.execute("""
        INSERT INTO req_request (id, tenant_id, company_id, request_number, request_type, title, description, amount, status, requester_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (req[0], tenant_id, comp_id, req[1], req[2], req[3], req[4], req[5], req[6], req[7]))

    # Dummy CRM Leads
    leads = [
        ("lead-001", "PT Indofood Sukses Makmur", "Ibu Rina S.", "081234567890", "rina.s@indofood.co.id", "Bahan Baku & Dry Food", "Surabaya", "Semarang & Cikarang", 850000000, "WON"),
        ("lead-002", "PT Mayora Indah Tbk", "Pak Joko W.", "081987654321", "joko.w@mayora.co.id", "FMCG Biscuits & Confectionery", "Tangerang", "Surabaya & Malang", 420000000, "PROPOSAL"),
        ("lead-003", "CV Berkah Logistik Nusantara", "Pak Hendro", "085678901234", "hendro@berkahlogistik.id", "Distribusi Sparepart Traktor", "Gresik", "Banjarmasin", 160000000, "QUALIFIED"),
    ]

    for ld in leads:
        cursor.execute("""
        INSERT INTO crm_lead (id, tenant_id, company_id, client_name, contact_person, phone, email, cargo_type, route_origin, route_destination, estimated_value, stage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (ld[0], tenant_id, comp_id, ld[1], ld[2], ld[3], ld[4], ld[5], ld[6], ld[7], ld[8], ld[9]))

    # Dummy Invoices
    invoices = [
        ("inv-001", "INV-MLG/2026/001", "PT Indofood Sukses Makmur", "2026-10-15", "2026-11-15", 85000000, 9350000, 94350000, "PAID"),
        ("inv-002", "INV-MLG/2026/002", "PT Semen Indonesia Logistik", "2026-10-28", "2026-11-28", 145000000, 15950000, 160950000, "UNPAID"),
        ("inv-003", "INV-MLG/2026/003", "PT Pelabuhan Indonesia (Pelindo)", "2026-11-01", "2026-11-20", 32000000, 3520000, 35520000, "UNPAID"),
    ]

    for inv in invoices:
        cursor.execute("""
        INSERT INTO fin_invoice (id, tenant_id, company_id, invoice_number, customer_name, issue_date, due_date, subtotal, tax, total_amount, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (inv[0], tenant_id, comp_id, inv[1], inv[2], inv[3], inv[4], inv[5], inv[6], inv[7], inv[8]))

    # Dummy Notifications
    notifs = [
        ("notif-001", "u-pm", "Armada Hino B 9122 MLG Tiba di Tujuan", "Unit telah sampai di Gudang Distribusi Cirebon pukul 08:30 WIB dengan aman.", "FLEET", 0),
        ("notif-002", "u-om", "Approval Request BBM Diperlukan", "Permintaan BBM Solar Rp 14.500.000 menunggu verifikasi Manajer Operasional.", "APPROVAL", 0),
        ("notif-003", "u-finance", "Invoice INV-MLG/2026/002 Jatuh Tempo", "Tagihan PT Semen Indonesia Logistik sebesar Rp 160.950.000 jatuh tempo dalam 7 hari.", "FINANCE", 0),
    ]

    for nf in notifs:
        cursor.execute("""
        INSERT INTO sys_notification (id, tenant_id, user_id, title, message, category, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (nf[0], tenant_id, nf[1], nf[2], nf[3], nf[4], nf[5]))

    conn.commit()

    # 3. Generate SQL Dump File
    with open(SQL_PATH, "w", encoding="utf-8") as f:
        for line in conn.iterdump():
            f.write(f"{line}\n")

    conn.close()
    print(f"[OK] Database SQLite berhasil dibuat: {DB_PATH}")
    print(f"[OK] SQL Script Dump berhasil dibuat: {SQL_PATH}")

if __name__ == "__main__":
    create_and_seed_database()

