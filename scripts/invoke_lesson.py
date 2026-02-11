import requests
import json
import time

def main():
    api_gateway_url = "http://localhost:8000" # Update to your local or deployed API Gateway URL
    # Or, if deployed:
    # api_gateway_url = "https://your-api-gateway-url.azurecontainerapps.io"
    
    topic = "DuckDB"
    user_id = "user123"

    print(f"Starting lesson on topic: {topic}...")
    try:
        response = requests.post(f"{api_gateway_url}/start_lesson", json={"topic": topic, "user_id": user_id})
        start_data = response.json()
    except Exception as e:
        print(f"Failed to start lesson. Make sure API Gateway is running: {api_gateway_url}")
        return

    print(f"Lesson Started!\nContent:\n{start_data.get('content_text')}\n")
    
    if start_data.get("is_finished"):
        print("Lesson finished immediately.")
        return

    # Simulate interaction
    while True:
        action = input("Enter 'n' for next, 'q' to ask question, or 'exit' to quit: ").strip().lower()
        if action == 'exit':
            break
        
        question_text = None
        if action == 'q':
            question_text = input("What would you like to ask? ")
            
        req_body = {
            "user_id": user_id, 
            "question_text": question_text if question_text else "continue"
        }
        
        try:
            interaction_resp = requests.post(f"{api_gateway_url}/interact", json=req_body)
            data = interaction_resp.json()
            print(f"\nResponse:\n{data.get('content_text')}\n")
            
            if data.get("is_finished"):
                print("Lesson Finished!")
                break
        except Exception as e:
            print(f"Interaction failed: {e}")
            break

if __name__ == "__main__":
    import os
    # Try to grab URL from env if set
    url = os.getenv("API_GATEWAY_URL")
    if url:
        # Override the hardcoded one inside main logic (hacky demonstration)
        # Better: pass as argument
        pass
        
    main()
