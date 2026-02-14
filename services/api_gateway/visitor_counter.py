import os
import logging
from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError
from azure.cosmos import PartitionKey

logger = logging.getLogger("uvicorn")

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
DATABASE_NAME = os.getenv("COSMOS_DATABASE", "databro-db")
CONTAINER_NAME = os.getenv("COSMOS_CONTAINER", "visitors")

async def get_and_increment_visitor_count():
    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        logger.warning("Cosmos DB credentials not found. Visitor counter disabled.")
        return 0

    try:
        async with CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY) as client:
            database = client.get_database_client(DATABASE_NAME)
            container = database.get_container_client(CONTAINER_NAME)

            item_id = "global-counter"
            
            try:
                # Try to read the item
                item = await container.read_item(item=item_id, partition_key=item_id)
                new_count = item.get("count", 0) + 1
                item["count"] = new_count
                await container.replace_item(item=item_id, body=item)
                return new_count
            except CosmosHttpResponseError as e:
                if e.status_code == 404:
                    # Item doesn't exist, create it
                    try:
                        new_item = {"id": item_id, "count": 1}
                        await container.create_item(body=new_item)
                        return 1
                    except Exception as create_error:
                        logger.error(f"Error creating visitor counter: {create_error}")
                        return 0
                else:
                    logger.error(f"Cosmos DB error: {e}")
                    return 0
    except Exception as e:
        logger.error(f"Unexpected error in visitor counter: {e}")
        return 0
