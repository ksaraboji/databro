
import duckdb
try:
    con = duckdb.connect()
    if hasattr(con, 'checkpoint'):
        print("con.checkpoint exists")
    else:
        print("con.checkpoint DOES NOT exist")
        # Try correct way
        try:
             con.execute("CHECKPOINT")
             print("CHECKPOINT via SQL works")
        except Exception as e:
             print(f"CHECKPOINT via SQL failed: {e}")
except Exception as e:
    print(f"Error: {e}")
