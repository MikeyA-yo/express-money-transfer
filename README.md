# Express Money Transfer API

A simple RESTful API for managing accounts and transferring money between them. Built with Node.js, Express, and MongoDB (Mongoose).

## Features

- **Account Management**: Create, read, update, and delete user accounts.
- **Money Transfers**: Transfer money between accounts safely.
- **Transactions**: Uses MongoDB transactions to ensure data consistency during money transfers. Note: this requires MongoDB to be configured as a replica set.
- **Pagination**: Supports pagination for listing accounts and transfers.

## Prerequisites

- [Node.js](https://nodejs.org/) (ES Modules are used)
- [MongoDB](https://www.mongodb.com/) database (must support transactions, e.g., MongoDB Atlas or a local replica set)

## Setup and Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd express-money-transfer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` or create a new `.env` file in the root directory and add the following:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=8000
   ```

4. Start the server:
   ```bash
   node index.js
   ```

## API Endpoints

### Accounts

Base path: `/api/v1/accounts`

- **GET `/`**: Get a list of accounts.
  - Query parameters: `page` (default: 1), `limit` (default: 10)
- **GET `/:id`**: Get a specific account by its custom ID.
- **POST `/`**: Create a new account.
  - Request Body:
    ```json
    {
      "name": "John Doe",
      "email": "john@example.com",
      "balance": 5000
    }
    ```
- **PATCH `/:id`**: Update an existing account.
  - Request Body: fields to update (e.g., `name`, `email`, `balance`).
- **DELETE `/:id`**: Delete an account.

### Transfers

Base path: `/api/v1/transfers`

- **GET `/`**: Get a list of transfers.
  - Query parameters: `page` (default: 1), `limit` (default: 10)
- **GET `/:id`**: Get a specific transfer by its ID.
- **POST `/`**: Initiate a money transfer between two accounts.
  - Request Body:
    ```json
    {
      "fromAccountId": "source_account_id",
      "toAccountId": "destination_account_id",
      "amount": 500
    }
    ```

## Technologies Used

- **Express.js**: Web framework for Node.js
- **Mongoose**: Elegant MongoDB object modeling for Node.js
- **dotenv**: Module to load environment variables from a `.env` file

## Improvements
- add end to end unit testing and separate the app from the entry point (index.js)
- add config for environment variables set ups and connections to app services
- add loggers, helmet, input sanitisation
- use a base schema, and let other schema extend base schema, base schema can contain timestamps and stuff