# MedCore (React + Express + MySQL)

This project is a full-stack medical management UI powered by a Node.js + Express backend and a MySQL (AWS RDS compatible) database.

## 🧭 Project Structure

- `src/` – Main React frontend (Vite)
- `server/` – Main Express backend API (uses MySQL via `mysql2`)
- `medcare_admin/` – Separate admin UI + server (Vite + Express) for user management and admin workflows

## 🚀 Getting Started (Local Development)

### 1) Setup Backend

1. Copy the example env file:

```bash
cp server/.env.example server/.env
```

2. Update `server/.env` with your MySQL (AWS RDS) credentials.

3. Install backend dependencies:

```bash
cd server
npm install
```

4. Start the backend server:

```bash
npm run dev
```

### 2) Setup Frontend

1. Install frontend dependencies (from repo root):

```bash
npm install
```

2. Create a `.env` file based on `.env.example` and point the API base URL to the backend:

```bash
cp .env.example .env
```

3. Start the frontend dev server:

```bash
npm run dev
```

4. Visit the app in the browser (usually `http://localhost:5173`).

## 🔐 Default Credentials

A default admin user is created automatically on first run using values from `server/.env`:

- Email: `admin@medcore.local`
- Password: `admin123`

> **Important:** Change these credentials immediately in production.

## 🗂 API Overview

The backend exposes REST endpoints under `/api/*`, for example:

- `POST /api/auth/login` - authenticate and receive a JWT
- `GET /api/auth/me` - fetch the current user
- `GET/POST/PUT/PATCH/DELETE /api/patients`
- `GET/POST/PUT/PATCH/DELETE /api/appointments`
- `GET/POST/PUT/PATCH/DELETE /api/medicines`
- `GET/POST/PUT/PATCH/DELETE /api/prescriptions`
- `GET/POST/PUT/PATCH/DELETE /api/diagnosis-records`

## 🛠 Notes

- The frontend uses `src/api/apiClient.js` as a lightweight wrapper around the backend API.
- Video call signaling is stored on the appointment record and handled via the `/api/functions/videoRoom` endpoint.
