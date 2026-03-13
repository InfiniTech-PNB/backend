# Backend API – Authentication & Authorization Service

## Overview

This backend service provides **secure user authentication and authorization** for the hackathon application.

The system uses **email and password login followed by OTP verification** to ensure an additional layer of security.
It also implements **role-based access control** to manage permissions for different types of users.

The backend is built using **Node.js and Express**, with **MongoDB** as the database and **Redis** for OTP storage.

---

# Tech Stack

Backend Framework

* Node.js
* Express.js

Database

* MongoDB
* Mongoose

Authentication & Security

* JSON Web Token (JWT)
* bcrypt (password hashing)

OTP System

* Redis
* Nodemailer

---

# Backend Features

The backend implements the following features:

### User Registration

Users can create accounts using:

* Name
* Email
* Password

Passwords are **securely hashed using bcrypt** before storing in the database.

---

### Login Authentication

Users login using:

* Email
* Password

If credentials are valid, the system sends an **OTP to the user's email** for second-step verification.

---

### Email OTP Verification

After login:

1. An OTP is generated.
2. OTP is stored temporarily in **Redis**.
3. OTP is sent to the user's email.
4. User submits OTP to verify identity.

If OTP is correct, a **JWT token is generated**.

---

### JWT Authentication

After successful OTP verification:

* A **JWT token** is issued.
* The token must be included in API requests.

Example:

Authorization: Bearer TOKEN

---

### Role-Based Authorization

The backend supports two roles:

* user
* admin

Protected routes use middleware to check:

1. Valid JWT token
2. User role

---

# API Endpoints

## Register User

POST `/api/auth/register`

Request Body

{
"name": "User1",
"email": "user1@gmail.com",
"password": "123456"
}

---

## Login

POST `/api/auth/login`

Request Body

{
"email": "user1@gmail.com",
"password": "123456"
}

After successful login, an **OTP will be sent to the user's email**.

---

## Verify OTP

POST `/api/auth/verify-otp`

{
"email": "user1@gmail.com",
"otp": "123456"
}

If OTP is valid, the system returns a **JWT token**.

---

## Protected Route Example

GET `/api/admin/dashboard`

Access requires:

* Valid JWT token
* Admin role

# Security Measures

The backend implements several security practices:

* Password hashing using **bcrypt**
* **JWT-based authentication**
* **Email OTP verification**
* **Redis OTP expiry**
* **Role-based authorization**
* Protected API routes

---

# Author

Akshay
Backend Developer – MERN Stack