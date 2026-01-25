
const { format } = require('sql-formatter');

const testDialects = ['plsql', 'transactsql', 'tsql']; // tsql might be an alias or the actual name

testDialects.forEach(d => {
    try {
        format("SELECT 1 FROM DUAL", { language: d });
        console.log(`${d}: Supported`);
    } catch (e) {
        console.log(`${d}: Not supported (${e.message})`);
    }
});
