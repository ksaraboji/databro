
import { format } from 'sql-formatter';

const query = `COPY INTO @my_s3_stage/sales_data/ FROM (SELECT * FROM analytics_db.public.sales) FILE_FORMAT=(TYPE=CSV FIELD_OPTIONALLY_ENCLOSED_BY='"' COMPRESSION=GZIP) HEADER=TRUE OVERWRITE=TRUE MAX_FILE_SIZE=50000000;`;

const dialects = ['postgresql', 'db2'];

dialects.forEach(d => {
    try {
        console.log(`Testing ${d}...`);
        // We are NOT passing paramTypes here, mimicking the 'undefined' case in the React code
        const formatted = format(query, {
            language: d,
        });
        console.log(`[${d}] Success (Unexpected?):`);
        console.log(formatted.substring(0, 50) + "...");
    } catch (e) {
        console.log(`[${d}] Error (Expected):`);
        console.log(e.message);
    }
});
