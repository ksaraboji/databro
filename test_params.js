
const { format } = require('sql-formatter');

const query = `COPY INTO @my_s3_stage/sales_data/ FROM (SELECT * FROM analytics_db.public.sales) FILE_FORMAT=(TYPE=CSV FIELD_OPTIONALLY_ENCLOSED_BY='"' COMPRESSION=GZIP) HEADER=TRUE OVERWRITE=TRUE MAX_FILE_SIZE=50000000;`;

// Test DB2 with explicit disable of parameters
try {
    console.log("Testing DB2 with defaults...");
    format(query, { language: 'db2' });
    console.log("DB2 Default: Success (Accepted @)");
} catch (e) { console.log(e.message); }

try {
    console.log("Testing DB2 with paramTypes: { named: [] }...");
    format(query, { language: 'db2', paramTypes: { named: [] } });
    console.log("DB2 Disabled: Success (Still Accepted @?)");
} catch (e) { 
    console.log("DB2 Disabled: Error!");
    console.log(e.message); 
}

// Test Postgres
try {
    console.log("Testing PG with paramTypes: { named: [] }...");
    format(query, { language: 'postgresql', paramTypes: { named: [] } });
    console.log("PG Disabled: Success (Still Accepted @?)");
} catch (e) {
    console.log("PG Disabled: Error!");
    console.log(e.message);
}
