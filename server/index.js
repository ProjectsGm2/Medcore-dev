import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import medicineRoutes from './routes/medicines.js';
import supplierRoutes from './routes/suppliers.js';
import grnRoutes from './routes/grn.js';
import saleRoutes from './routes/sales.js';
import salesBillRoutes from './routes/salesBills.js';
import settingsRoutes from './routes/settings.js';
import prescriptionRoutes from './routes/prescriptions.js';
import diagnosisRoutes from './routes/diagnosisRecords.js';
import functionRoutes from './routes/functions.js';
import masterRoutes from './routes/masters.js';
import importExportRoutes from './routes/importExport.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
  exposedHeaders: ["Content-Length"],
  optionsSuccessStatus: 204,
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/grn', grnRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/sales-bills', salesBillRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/diagnosis-records', diagnosisRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/import-export', importExportRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({ message: 'Request payload is too large. Import will need to be sent in smaller chunks.' });
  }
  const status = Number(err?.status || err?.statusCode || 500);
  const message = err?.message || 'Internal server error';
  return res.status(status).json({ message });
});

const PORT = process.env.PORT || 4001;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
