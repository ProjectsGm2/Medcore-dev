import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const {
  DB_HOST = 'localhost', 
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_PASSWORD_SECRET_ARN = '',
  DB_NAME = 'medcore',
  AWS_REGION = '',
  ADMIN_EMAIL = 'admin@medcore.local',
  ADMIN_PASSWORD = 'admin123',
} = process.env;

function getRegionFromArn(arn) {
  // ARN format: arn:partition:service:region:account-id:resource
  const parts = arn.split(':'); 
  if (parts.length >= 4) {
    return parts[3];
  }
  return undefined;
}

async function getDbPasswordFromSecretsManager(secretArn) {
  const region = AWS_REGION || getRegionFromArn(secretArn);
  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretArn });

  let response;
  try {
    response = await client.send(command);
  } catch (err) {
    // Provide a clearer message when credentials are missing.
    if (err.name === 'CredentialsProviderError') {
      throw new Error(
        `Failed to retrieve secret from Secrets Manager (${secretArn}). ` +
          'AWS credentials are required. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or configure an IAM role.\n' +
          'Original error: ' + err.message
      );
    }
    throw err;
  }

  if (!response.SecretString) {
    throw new Error('Secrets Manager returned no secret string for ' + secretArn);
  }

  try {
    const secret = JSON.parse(response.SecretString);
    if (typeof secret.password === 'string' && secret.password.length > 0) {
      return secret.password;
    }
  } catch {
    // Not JSON; fall back to returning raw string
  }

  return response.SecretString;
}

let pool;

const MASTER_TABLE_CONFIGS = [
  { type: 'medicine_category', table: 'medicine_category_master', nameLength: 255 },
  { type: 'medicine_group', table: 'medicine_group_master', nameLength: 255 },
  { type: 'medicine_unit', table: 'medicine_unit_master', nameLength: 50 },
  { type: 'medicine_manufacturer', table: 'medicine_manufacturer_master', nameLength: 255 },
  { type: 'staff_role', table: 'staff_role_master', nameLength: 100, seeds: ['admin', 'doctor', 'receptionist'] },
  { type: 'staff_designation', table: 'staff_designation_master', nameLength: 100 },
  { type: 'service', table: 'service_master', nameLength: 255, hasPrice: true },
];

const MASTER_TABLE_BY_TYPE = Object.fromEntries(MASTER_TABLE_CONFIGS.map((cfg) => [cfg.type, cfg]));

function normalizeMasterName(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

async function createMasterTable(conn, cfg) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`${cfg.table}\` (
      id VARCHAR(36) PRIMARY KEY,
      legacy_id VARCHAR(100),
      name VARCHAR(${cfg.nameLength}) NOT NULL,
      ${cfg.hasPrice ? 'price DECIMAL(12,2) NOT NULL DEFAULT 0,' : ''}
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_name (name),
      UNIQUE KEY unique_legacy_id (legacy_id)
    );
  `);
  if (cfg.hasPrice) {
    try {
      await conn.query(`ALTER TABLE \`${cfg.table}\` ADD COLUMN price DECIMAL(12,2) NOT NULL DEFAULT 0`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_COLUMN') throw e;
    }
  }
}

async function upsertMasterValue(conn, tableName, name, legacyId = null) {
  const normalizedName = normalizeMasterName(name);
  if (!normalizedName) return;
  const normalizedLegacyId = legacyId == null || String(legacyId).trim() === '' ? null : String(legacyId).trim();
  await conn.query(
    `INSERT INTO \`${tableName}\` (id, legacy_id, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       legacy_id = COALESCE(legacy_id, VALUES(legacy_id))`,
    [uuidv4(), normalizedLegacyId, normalizedName]
  );
}

async function backfillMasterTable(conn, tableName, selectSql) {
  const [rows] = await conn.query(selectSql);
  for (const row of rows) {
    await upsertMasterValue(conn, tableName, row.name, row.legacy_id ?? null);
  }
}

async function addForeignKey(conn, tableName, constraintName, columnName, refTableName, onDelete = 'SET NULL') {
  try {
    await conn.query(
      `ALTER TABLE \`${tableName}\`
       ADD CONSTRAINT \`${constraintName}\`
       FOREIGN KEY (\`${columnName}\`) REFERENCES \`${refTableName}\`(\`name\`)
       ON UPDATE CASCADE ON DELETE ${onDelete}`
    );
  } catch (e) {
    if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
  }
}

export async function initializeDatabase() {
  // Create database if it doesn't exist (some MySQL servers require the DB to exist before connecting)
  const effectivePassword =
    DB_PASSWORD || (DB_PASSWORD_SECRET_ARN ? await getDbPasswordFromSecretsManager(DB_PASSWORD_SECRET_ARN) : '');

  let initConn;
  try {
    initConn = await mysql.createConnection({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: effectivePassword,
    });
  } catch (err) {
    throw new Error(
      `Failed to connect to MySQL at ${DB_HOST}:${DB_PORT} as '${DB_USER}'. ` +
        `Please verify the host, port, credentials, and network access.\n` +
        `Original error: ${err.message}`
    );
  }

  await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
  await initConn.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: effectivePassword,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const conn = await pool.getConnection();
  try {
    // Users
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        name VARCHAR(255),
        full_name VARCHAR(255),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(100) NOT NULL DEFAULT 'doctor',
        phone VARCHAR(50),
        designation VARCHAR(100),
        specialization VARCHAR(100),
        doctor_fee DECIMAL(12,2),
        photo_url TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    // Safe alters for users extra columns
    const userColumnAlters = [
      'ADD COLUMN phone VARCHAR(50) NULL',
      'ADD COLUMN designation VARCHAR(100) NULL',
      'ADD COLUMN specialization VARCHAR(100) NULL',
      'ADD COLUMN doctor_fee DECIMAL(12,2) NULL',
      'ADD COLUMN photo_url TEXT NULL',
      'ADD COLUMN full_name VARCHAR(255) NULL',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT "doctor"',
    ];
    for (const fragment of userColumnAlters) {
      try {
        await conn.query(`ALTER TABLE users ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }

    // Patients
    await conn.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(36) PRIMARY KEY,
        uhid VARCHAR(100) UNIQUE,
        legacy_id VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        age INT,
        gender VARCHAR(50),
        blood_group VARCHAR(50),
        date_of_birth DATE,
        known_allergies TEXT,
        marital_status VARCHAR(50),
        guardian_name VARCHAR(255),
        address VARCHAR(500),
        emergency_contact VARCHAR(255),
        medical_notes TEXT,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Migrate existing patient tables (ignore duplicate column)
    const patientColumnAlters = [
      'ADD COLUMN date_of_birth DATE NULL',
      'ADD COLUMN known_allergies TEXT NULL',
      'ADD COLUMN marital_status VARCHAR(50) NULL',
      'ADD COLUMN guardian_name VARCHAR(255) NULL',
      'ADD COLUMN address VARCHAR(500) NULL',
      'ADD COLUMN emergency_contact VARCHAR(255) NULL',
      'ADD COLUMN medical_notes TEXT NULL',
      'ADD COLUMN uhid VARCHAR(100) UNIQUE',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
    ];
    for (const fragment of patientColumnAlters) {
      try {
        await conn.query(`ALTER TABLE patients ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }

    // Appointments
    await conn.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        patient_id VARCHAR(36) NOT NULL,
        doctor_id VARCHAR(36),
        doctor_ids_json TEXT,
        doctor_names TEXT,
        appointment_date DATETIME,
        appointment_time VARCHAR(50),
        reason TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
        type VARCHAR(50) NOT NULL DEFAULT 'In-Person',
        payment_mode VARCHAR(50),
        discount DECIMAL(12,2) DEFAULT 0,
        priority VARCHAR(50) NOT NULL DEFAULT 'Normal',
        video_room_id VARCHAR(255),
        video_status VARCHAR(50),
        notes TEXT,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    // Safe alters for new appointment fields
    const appointmentColumnAlters = [
      'ADD COLUMN payment_mode VARCHAR(50) NULL',
      'ADD COLUMN discount DECIMAL(12,2) DEFAULT 0',
      "ADD COLUMN priority VARCHAR(50) NOT NULL DEFAULT 'Normal'",
      'ADD COLUMN doctor_ids_json TEXT NULL',
      'ADD COLUMN doctor_names TEXT NULL',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
    ];
    for (const fragment of appointmentColumnAlters) {
      try {
        await conn.query(`ALTER TABLE appointments ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }

    // Suppliers (dispensary / GRN)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        drug_license_number VARCHAR(100),
        poc_name VARCHAR(255),
        address TEXT,
        notes TEXT,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    const supplierColumnAlters = [
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'ADD COLUMN email VARCHAR(255) NULL',
      'ADD COLUMN drug_license_number VARCHAR(100) NULL',
      'ADD COLUMN poc_name VARCHAR(255) NULL',
    ];
    for (const fragment of supplierColumnAlters) {
      try {
        await conn.query(`ALTER TABLE suppliers ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }

    // Medicines (master + legacy pricing/stock fields)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(255),
        company VARCHAR(255),
        composition TEXT,
        medicine_group VARCHAR(255),
        units VARCHAR(50),
        min_level INT DEFAULT 0,
        reorder_level INT DEFAULT 0,
        box_packaging VARCHAR(255),
        rack_number VARCHAR(100),
        notes_description TEXT,
        description TEXT,
        price DECIMAL(12,2) DEFAULT 0,
        stock INT DEFAULT 0,
        expiry_date DATE,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    const medicineColumnAlters = [
      'ADD COLUMN company VARCHAR(255) NULL',
      'ADD COLUMN composition TEXT NULL',
      'ADD COLUMN medicine_group VARCHAR(255) NULL',
      'ADD COLUMN units VARCHAR(50) NULL',
      'ADD COLUMN min_level INT NULL',
      'ADD COLUMN reorder_level INT NULL',
      'ADD COLUMN box_packaging VARCHAR(255) NULL',
      'ADD COLUMN rack_number VARCHAR(100) NULL',
      'ADD COLUMN notes_description TEXT NULL',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'DROP COLUMN type',
    ];
    for (const fragment of medicineColumnAlters) {
      try {
        await conn.query(`ALTER TABLE medicines ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw e;
      }
    }

    // GRN (goods receipt note) header
    await conn.query(`
      CREATE TABLE IF NOT EXISTS grn (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        supplier_id VARCHAR(36),
        bill_number VARCHAR(100),
        bill_date DATE,
        notes TEXT,
        discount DECIMAL(12,2) DEFAULT 0,
        tax_amount DECIMAL(14,4) DEFAULT 0,
        net_total_amount DECIMAL(14,4) DEFAULT 0,
        total_amount DECIMAL(14,4) DEFAULT 0,
        payment_mode VARCHAR(50),
        payment_note TEXT,
        created_by VARCHAR(36),
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    // Safe migrations for new GRN columns
    const grnColumnAlters = [
      'ADD COLUMN discount DECIMAL(12,2) DEFAULT 0',
      'ADD COLUMN tax_amount DECIMAL(14,4) DEFAULT 0',
      'ADD COLUMN net_total_amount DECIMAL(14,4) DEFAULT 0',
      'ADD COLUMN total_amount DECIMAL(14,4) DEFAULT 0',
      'ADD COLUMN payment_mode VARCHAR(50) NULL',
      'ADD COLUMN payment_note TEXT NULL',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
    ];
    for (const fragment of grnColumnAlters) {
      try {
        await conn.query(`ALTER TABLE grn ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }

    // GRN line items
    await conn.query(`
      CREATE TABLE IF NOT EXISTS grn_lines (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        grn_id VARCHAR(36) NOT NULL,
        medicine_id VARCHAR(36) NOT NULL,
        batch_number VARCHAR(100),
        expiry_date DATE,
        mrp DECIMAL(12,2) DEFAULT 0,
        batch_amount DECIMAL(12,2) DEFAULT 0,
        sale_price DECIMAL(12,2) DEFAULT 0,
        packing_quantity INT DEFAULT 1,
        quantity INT NOT NULL DEFAULT 0,
        purchase_price DECIMAL(12,2) DEFAULT 0,
        tax_percent DECIMAL(8,4) DEFAULT 0,
        line_amount DECIMAL(14,4) DEFAULT 0,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (grn_id) REFERENCES grn(id) ON DELETE CASCADE,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE RESTRICT
      );
    `);
    try {
      await conn.query('ALTER TABLE grn_lines ADD COLUMN legacy_id VARCHAR(100) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await conn.query('ALTER TABLE grn_lines DROP FOREIGN KEY fk_grn_lines_category_master_name');
    } catch (e) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_NONEXISTENT_CONSTRAINT') throw e;
    }
    try {
      await conn.query('ALTER TABLE grn_lines DROP COLUMN medicine_category');
    } catch (e) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw e;
    }

    try {
      await conn.query('ALTER TABLE grn_lines ADD COLUMN quantity_remaining INT NOT NULL DEFAULT 0');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Sales
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id VARCHAR(36) PRIMARY KEY,
        medicine_id VARCHAR(36) NOT NULL,
        medicine_name VARCHAR(255),
        quantity_sold INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) DEFAULT 0,
        total_amount DECIMAL(12,2) DEFAULT 0,
        sale_date DATE,
        patient_name VARCHAR(255),
        notes TEXT,
        sold_by VARCHAR(36),
        sold_by_name VARCHAR(255),
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE RESTRICT
      );
    `);
    // Sales bills (header)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales_bills (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        doctor_name VARCHAR(255),
        doctor_id VARCHAR(36),
        patient_name VARCHAR(255),
        patient_id VARCHAR(36),
        prescription_id VARCHAR(36),
        notes TEXT,
        payment_mode VARCHAR(50),
        payment_amount DECIMAL(12,2) DEFAULT 0,
        subtotal DECIMAL(14,4) DEFAULT 0,
        tax_total DECIMAL(14,4) DEFAULT 0,
        discount_total DECIMAL(14,4) DEFAULT 0,
        gross_total DECIMAL(14,4) DEFAULT 0,
        net_total DECIMAL(14,4) DEFAULT 0,
        generated_by VARCHAR(36),
        generated_by_name VARCHAR(255),
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_legacy_id (legacy_id),
        FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL
      );
    `);

    // Migrate sales_bills table
    const salesBillColumnAlters = [
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'ADD COLUMN doctor_id VARCHAR(36) NULL',
      'ADD COLUMN patient_id VARCHAR(36) NULL',
      'ADD COLUMN prescription_id VARCHAR(36) NULL',
      'ADD COLUMN generated_by VARCHAR(36) NULL',
      'ADD COLUMN generated_by_name VARCHAR(255) NULL',
    ];
    for (const fragment of salesBillColumnAlters) {
      try {
        await conn.query(`ALTER TABLE sales_bills ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
           // Ignore
        }
      }
    }
    try {
      await conn.query(
        'ALTER TABLE sales_bills ADD CONSTRAINT fk_sales_bills_generated_by FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL'
      );
    } catch (e) {
      if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') {
        // Ignore
      }
    }
    try {
      await conn.query('ALTER TABLE sales_bills ADD UNIQUE KEY unique_legacy_id (legacy_id)');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') {
        // Ignore
      }
    }

    // Sales bill lines
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales_bill_lines (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        bill_id VARCHAR(36) NOT NULL,
        item_type ENUM('medicine', 'service') NOT NULL DEFAULT 'medicine',
        item_name VARCHAR(255),
        grn_line_id VARCHAR(36),
        sale_price DECIMAL(12,2) DEFAULT 0,
        quantity INT NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,4) DEFAULT 0,
        line_total DECIMAL(14,4) DEFAULT 0,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_legacy_id (legacy_id),
        FOREIGN KEY (bill_id) REFERENCES sales_bills(id) ON DELETE CASCADE,
        FOREIGN KEY (grn_line_id) REFERENCES grn_lines(id) ON DELETE SET NULL
      );
    `);

    // Migrate sales_bill_lines table
    const salesBillLinesAlters = [
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'ADD COLUMN item_type ENUM("medicine", "service") NOT NULL DEFAULT "medicine"',
      'ADD COLUMN item_name VARCHAR(255) NULL',
      'ADD COLUMN grn_line_id VARCHAR(36) NULL',
    ];
    for (const fragment of salesBillLinesAlters) {
      try {
        await conn.query(`ALTER TABLE sales_bill_lines ${fragment}`);
      } catch (e) {
        // Ignore duplicate column errors
      }
    }
    try {
      await conn.query('ALTER TABLE sales_bill_lines DROP COLUMN tax_percent');
    } catch (e) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    try {
      await conn.query('ALTER TABLE sales_bill_lines DROP COLUMN line_tax');
    } catch (e) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    try {
      await conn.query(
        'ALTER TABLE sales_bill_lines ADD CONSTRAINT fk_sales_bill_lines_grn_line_id FOREIGN KEY (grn_line_id) REFERENCES grn_lines(id) ON DELETE SET NULL'
      );
    } catch (e) {
      if (e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') {
        // Ignore
      }
    }
    try {
      await conn.query('ALTER TABLE sales_bill_lines ADD UNIQUE KEY unique_legacy_id (legacy_id)');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') {
        // Ignore
      }
    }
    try {
      await conn.query('UPDATE grn_lines SET quantity_remaining = quantity WHERE quantity_remaining = 0 AND quantity > 0');
    } catch {}

    await conn.query(`
      CREATE TABLE IF NOT EXISTS masters (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY type_name (type, name),
        UNIQUE KEY unique_legacy_id (legacy_id)
      );
    `);
    try {
      await conn.query('ALTER TABLE masters DROP COLUMN value');
    } catch (e) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    try {
      await conn.query('ALTER TABLE masters ADD COLUMN legacy_id VARCHAR(100) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await conn.query('ALTER TABLE masters ADD UNIQUE KEY unique_legacy_id (legacy_id)');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') throw e;
    }

    for (const cfg of MASTER_TABLE_CONFIGS) {
      await createMasterTable(conn, cfg);
      try {
        await conn.query(`ALTER TABLE \`${cfg.table}\` DROP COLUMN value`);
      } catch (e) {
        if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
      try {
        await conn.query(`ALTER TABLE \`${cfg.table}\` ADD COLUMN legacy_id VARCHAR(100) NULL`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
      try {
        await conn.query(`ALTER TABLE \`${cfg.table}\` ADD UNIQUE KEY unique_legacy_id (legacy_id)`);
      } catch (e) {
        if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') throw e;
      }
    }

    await conn.query(`
      UPDATE users
      SET role = CASE
        WHEN role IS NULL OR TRIM(role) = '' THEN 'doctor'
        WHEN LOWER(TRIM(role)) IN ('admin', 'administrator', 'super admin', 'superadmin') THEN 'admin'
        WHEN LOWER(TRIM(role)) IN ('doctor', 'dr', 'physician', 'consultant', 'medical officer') THEN 'doctor'
        WHEN LOWER(TRIM(role)) IN ('receptionist', 'reception', 'front office', 'front desk', 'frontoffice', 'frontdesk') THEN 'receptionist'
        WHEN LOWER(TRIM(role)) LIKE '%admin%' THEN 'admin'
        WHEN LOWER(TRIM(role)) LIKE '%doctor%' OR LOWER(TRIM(role)) LIKE '%physician%' OR LOWER(TRIM(role)) LIKE '%consult%' THEN 'doctor'
        WHEN LOWER(TRIM(role)) LIKE '%front%' OR LOWER(TRIM(role)) LIKE '%reception%' OR LOWER(TRIM(role)) LIKE '%desk%' OR LOWER(TRIM(role)) LIKE '%office%' THEN 'receptionist'
        ELSE 'doctor'
      END
    `);

    for (const seedName of MASTER_TABLE_BY_TYPE.staff_role.seeds) {
      await upsertMasterValue(conn, MASTER_TABLE_BY_TYPE.staff_role.table, seedName);
    }

    const [legacyMasterRows] = await conn.query('SELECT id, legacy_id, type, name FROM masters');
    for (const row of legacyMasterRows) {
      const cfg = MASTER_TABLE_BY_TYPE[row.type];
      if (!cfg) continue;
      const normalizedName = normalizeMasterName(row.name);
      if (!normalizedName) continue;
      await conn.query(
        `INSERT INTO \`${cfg.table}\` (id, legacy_id, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           legacy_id = COALESCE(legacy_id, VALUES(legacy_id))`,
        [
          row.id || uuidv4(),
          row.legacy_id == null || String(row.legacy_id).trim() === '' ? (row.id || null) : String(row.legacy_id).trim(),
          normalizedName,
        ]
      );
    }

    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.staff_role.table, `
      SELECT DISTINCT TRIM(role) AS name, NULL AS legacy_id
      FROM users
      WHERE role IS NOT NULL AND TRIM(role) <> ''
    `);
    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.staff_designation.table, `
      SELECT DISTINCT TRIM(designation) AS name, NULL AS legacy_id
      FROM users
      WHERE designation IS NOT NULL AND TRIM(designation) <> ''
    `);
    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.medicine_category.table, `
      SELECT DISTINCT TRIM(category) AS name, NULL AS legacy_id
      FROM medicines
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    `);
    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.medicine_group.table, `
      SELECT DISTINCT TRIM(medicine_group) AS name, NULL AS legacy_id
      FROM medicines
      WHERE medicine_group IS NOT NULL AND TRIM(medicine_group) <> ''
    `);
    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.medicine_unit.table, `
      SELECT DISTINCT TRIM(units) AS name, NULL AS legacy_id
      FROM medicines
      WHERE units IS NOT NULL AND TRIM(units) <> ''
    `);
    await backfillMasterTable(conn, MASTER_TABLE_BY_TYPE.medicine_manufacturer.table, `
      SELECT DISTINCT TRIM(company) AS name, NULL AS legacy_id
      FROM medicines
      WHERE company IS NOT NULL AND TRIM(company) <> ''
    `);

    await addForeignKey(conn, 'users', 'fk_users_role_master_name', 'role', MASTER_TABLE_BY_TYPE.staff_role.table, 'RESTRICT');
    await addForeignKey(conn, 'users', 'fk_users_designation_master_name', 'designation', MASTER_TABLE_BY_TYPE.staff_designation.table);
    await addForeignKey(conn, 'medicines', 'fk_medicines_category_master_name', 'category', MASTER_TABLE_BY_TYPE.medicine_category.table);
    await addForeignKey(conn, 'medicines', 'fk_medicines_group_master_name', 'medicine_group', MASTER_TABLE_BY_TYPE.medicine_group.table);
    await addForeignKey(conn, 'medicines', 'fk_medicines_unit_master_name', 'units', MASTER_TABLE_BY_TYPE.medicine_unit.table);
    await addForeignKey(conn, 'medicines', 'fk_medicines_manufacturer_master_name', 'company', MASTER_TABLE_BY_TYPE.medicine_manufacturer.table);

    // Settings key/value
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` LONGTEXT,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    try {
      await conn.query('ALTER TABLE settings MODIFY COLUMN `value` LONGTEXT');
    } catch (e) {
      if (e.code !== 'ER_PARSE_ERROR') throw e;
    }
    // Simple sequences for counters
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sequences (
        name VARCHAR(100) PRIMARY KEY,
        current INT NOT NULL DEFAULT 0,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Prescriptions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id VARCHAR(36) PRIMARY KEY,
        legacy_id VARCHAR(100),
        patient_id VARCHAR(36) NOT NULL,
        doctor_id VARCHAR(36),
        appointment_id VARCHAR(36),
        rx_code VARCHAR(100),
        diagnosis TEXT,
        notes TEXT,
        notes_meta JSON,
        medicines JSON,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
      );
    `);

    // Migrate prescriptions table
    const prescriptionColumnAlters = [
      'ADD COLUMN rx_code VARCHAR(100) NULL',
      'ADD COLUMN diagnosis TEXT NULL',
      'ADD COLUMN notes TEXT NULL',
      'ADD COLUMN notes_meta JSON NULL',
      'ADD COLUMN medicines JSON NULL',
      'ADD COLUMN legacy_id VARCHAR(100) NULL',
      'MODIFY COLUMN medicine_id VARCHAR(36) NULL',
    ];
    for (const fragment of prescriptionColumnAlters) {
      try {
        await conn.query(`ALTER TABLE prescriptions ${fragment}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_COLUMN' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
           // Silently ignore some common migration errors during dev
        }
      }
    }

    // Diagnosis records
    await conn.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_records (
        id VARCHAR(36) PRIMARY KEY,
        patient_id VARCHAR(36) NOT NULL,
        doctor_id VARCHAR(36),
        symptoms TEXT,
        diagnosis TEXT,
        created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Create default admin user if missing
    const [users] = await conn.query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
    if (!Array.isArray(users) || users.length === 0) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await conn.query(
        'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'Admin', ADMIN_EMAIL, passwordHash, 'admin']
      );
      console.log(`Created default admin user: ${ADMIN_EMAIL}`);
    }

    console.log('Database initialized');
  } finally {
    conn.release();
  }
}

export function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export { pool };
