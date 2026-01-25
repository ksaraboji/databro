
const { format } = require('sql-formatter');

const query = `COPY INTO @my_s3_stage/sales_data/ FROM (SELECT * FROM analytics_db.public.sales) FILE_FORMAT=(TYPE=CSV FIELD_OPTIONALLY_ENCLOSED_BY='"' COMPRESSION=GZIP) HEADER=TRUE OVERWRITE=TRUE MAX_FILE_SIZE=50000000;`;

try {
    const formatted = format(query, {
        language: 'snowflake',
    });
    console.log("Success:");
    console.log(formatted);
} catch (e) {
    console.log("Error:");
    console.log(e.message);
}
