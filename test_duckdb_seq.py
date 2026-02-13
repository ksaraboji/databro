
import duckdb

try:
    con = duckdb.connect()
    # Test 1: START before MINVALUE (My previous attempt)
    print("Test 1: CREATE SEQUENCE s1 START 0 MINVALUE 0;")
    con.execute("CREATE SEQUENCE s1 START 0 MINVALUE 0;")
    print("Success s1")
except Exception as e:
    print(f"Current syntax failed: {e}")

try:
    con = duckdb.connect()
    # Test 2: MINVALUE before START
    print("Test 2: CREATE SEQUENCE s2 MINVALUE 0 START 0;")
    con.execute("CREATE SEQUENCE s2 MINVALUE 0 START 0;")
    print("Success s2")
except Exception as e:
    print(f"Reordered syntax failed: {e}")
