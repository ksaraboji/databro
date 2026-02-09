# Azure Container Registry to store our custom images
resource "azurerm_container_registry" "main" {
  name                = "databro${var.environment}acr"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true # Required to let Container Apps pull directly using keys
}

# Grant Container Apps Environment access to pull from ACR
# Not stricly needed if using admin credentials (admin_enabled=true), 
# but a good practice for managed identities in future. 
