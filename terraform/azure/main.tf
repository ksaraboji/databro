terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  backend "azurerm" {}
}

provider "azurerm" {
  features {}
  skip_provider_registration = true
}

resource "azurerm_resource_group" "main" {
  name     = "databro-${var.environment}-rg"
  location = var.location
}

# Example resource: App Service Plan
# resource "azurerm_service_plan" "app_service_plan" {
#   name                = "databro-${var.environment}-plan"
#   resource_group_name = azurerm_resource_group.main.name
#   location            = azurerm_resource_group.main.location
#   os_type             = "Linux"
#   sku_name            = "B1"
# }
