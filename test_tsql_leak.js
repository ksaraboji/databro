
const { format } = require('sql-formatter');

const query = `SELECT TOP 10 * FROM users CROSS APPLY GetUserData(users.id)`;

// We expect TSQL to handle this "correctly" (as recognized keywords)
// We want to see what Postgres does.
console.log("--- TSQL (Expected) ---");
console.log(format(query, { language: 'transactsql', keywordCase: 'upper' }));

console.log("\n--- PostgreSQL (Unexpected?) ---");
console.log(format(query, { language: 'postgresql', keywordCase: 'upper' }));

const query2 = `SELECT DATEADD(day, 1, GETDATE())`;
console.log("\n--- PostgreSQL (Functions) ---");
console.log(format(query2, { language: 'postgresql', keywordCase: 'upper' }));
