resource "azurerm_storage_account" "app_data" {
  name                     = "databro${var.environment}st" # e.g. databrodevst
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "rag_state" {
  name                  = "rag-state"
  storage_account_name  = azurerm_storage_account.app_data.name
  container_access_type = "private"
}
