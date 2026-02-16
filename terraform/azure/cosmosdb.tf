resource "azurerm_cosmosdb_account" "main" {
  name                = "databro-${var.environment}-cosmos"
  location            = "East US 2" # Hardcoded to avoid East US capacity limits
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  free_tier_enabled = true

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = "East US 2" # Must match account location
    failover_priority = 0
    zone_redundant    = false 
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "databro-db"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "visitors" {
  name                = "visitors"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths = ["/id"]
  throughput          = 400 # Minimum throughput
}
