# KavachAI Backend API – Authentication & Authorization Service

This backend service provides secure user authentication and authorization for KavachAI. The system uses email and password login followed by OTP verification to ensure an additional layer of security. It also implements role-based access control to manage permissions for different types of users.

---

## 🚀 Features

- **Login Authentication**: Secure email and password login.
- **Email OTP Verification**: Temporary OTPs stored in Redis and sent via email for second-step verification.
- **JWT Authentication**: Token-based access for protected routes.
- **Role-Based Authorization**: Access management for 'user' and 'admin' roles.

---

## 🔄 Execution Flow / How it Works

1. **Login**: User logs in with email and password.
2. **OTP Generation**: If credentials are valid, an OTP is generated, stored temporarily in Redis, and sent to the user's email.
3. **Verification**: User submits the OTP to verify their identity.
4. **Token Issuance**: If the OTP is correct, a JWT token is generated and returned to the client.
5. **Protected Access**: The client includes the JWT token in subsequent API requests to access protected routes based on their role.

---

## 🛠️ Technology Stack

### Backend
- **Framework**: Node.js, Express.js
- **Database**: MongoDB, Mongoose
- **Authentication**: JSON Web Token (JWT), bcrypt
- **OTP System**: Redis, Nodemailer

---

## 📂 Project Structure

```text
backend-pnb/
├── config/                 # Configuration files
├── controllers/            # Route controllers
├── middlewares/            # Express middlewares
├── models/                 # Mongoose models
├── routes/                 # API endpoints
├── services/               # Business logic
├── utils/                  # Helper functions
├── app.js                  # Server entry point
├── package.json            # Node.js dependencies
└── .env                    # Environment variables
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js
- MongoDB (Running locally or via URI)
- Redis (Running locally or via URI)

### Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure `.env` file:
   Create a `.env` file in the root of `backend-pnb` with the following variables:
   ```env
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.evzikfr.mongodb.net/pqcscanner?retryWrites=true&w=majority&appName=Cluster0
   REDIS_USERNAME=default
   REDIS_PASSWORD=your_redis_password
   REDIS_END_POINT=your_redis_endpoint
   REDIS_PORT=6379
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_app_password
   JWT_SECRET=your_jwt_secret
   GROQ_API_KEY=your_groq_api_key
   ```

---

## 🏃 Running the Application

### Start the Backend
```bash
cd backend
node app.js
```

---

## 📊 API Endpoints

### Auth
- `POST /api/auth/login`: Authenticate user using email and password.
- `POST /api/auth/verify-otp`: Verify the OTP sent to user's email.

### Asset Discovery
- `POST /api/asset-discovery/:id/discover`: Discover assets for a given domain.
- `GET /api/asset-discovery/:id/assets`: Retrieve newly discovered network assets.

### CBOM (Cryptographic Bill of Materials)
- `POST /api/cbom/:id`: Generate CBOM for a scan.
- `GET /api/cbom/:scanId/cbom`: Retrieve a generated CBOM.
- `GET /api/cbom/:scanId/cbom/pdf`: Download the CBOM in PDF format.

### ChatBot
- `POST /api/chatbot/chat`: Ask AI chatbot questions about scan results.
- `GET /api/chatbot/:scanId`: Get chat history for a specific scan.

### Dashboard
- `GET /api/dashboard/stats`: Retrieve high-level statistics and risk summaries.

### Domains
- `POST /api/domains/`: Add a new domain to monitor.
- `GET /api/domains/`: List all registered domains.
- `GET /api/domains/:domainId/summary`: Get summarized information for a domain.
- `GET /api/domains/:domainId/crypto-inventory`: Retrieve the crypto inventory for a domain.

### Scan
- `POST /api/scan/`: Initiate a new scan.
- `GET /api/scan/:id/status`: Check the status of a scan.
- `GET /api/scan/:id/results`: Get the results of a scan.
- `POST /api/scan/:scanId/recommendations`: Generate AI recommendations based on scan results.
- `GET /api/scan/:scanId/recommendations`: Retrieve recommendations.
- `PATCH /api/scan/:id/cancel`: Cancel an ongoing scan.
- `GET /api/scan/domain/:domainId`: Retrieve scan history for a particular domain.

### Services
- `GET /api/services/:id/services`: Retrieve open network services for a discovered asset.

---

## 👤 Team Information
- **Author**: InfiniTech

---
