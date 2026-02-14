# 1. API Gateway (FastAPI) - The entry point
resource "azurerm_container_app" "api_gateway" {
  name                         = "api-gateway"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  secret {
    name  = "cosmos-key"
    value = azurerm_cosmosdb_account.main.primary_key
  }

  template {
    container {
      name   = "api-gateway"
      image  = "${azurerm_container_registry.main.login_server}/api-gateway:latest"
      cpu    = 1.0
      memory = "2.0Gi"

      env {
        name  = "LLM_SERVICE_URL"
        value = "http://llm-service"
      }
      env {
        name  = "RAG_SERVICE_URL"
        value = "http://rag-service"
      }
      env {
        name  = "SPEECH_SERVICE_URL"
        value = "http://speech-service"
      }
      env {
        name        = "COSMOS_ENDPOINT"
        value       = azurerm_cosmosdb_account.main.endpoint
      }
      env {
        name        = "COSMOS_KEY"
        secret_name = "cosmos-key"
      }
      env {
        name        = "COSMOS_DATABASE"
        value       = azurerm_cosmosdb_sql_database.main.name
      }
      env {
        name        = "COSMOS_CONTAINER"
        value       = azurerm_cosmosdb_sql_container.visitors.name
      }

      startup_probe {
        transport = "HTTP"
        port      = 80
        path      = "/health"
        initial_delay     = 10
        interval_seconds  = 5
        timeout           = 5
        failure_count_threshold = 10
      }
      
      liveness_probe {
        transport = "HTTP"
        port      = 80
        path      = "/health"
        initial_delay     = 15
        interval_seconds  = 10
        timeout           = 5
        failure_count_threshold = 3
      }
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 80
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# 2. LLM Service (Ollama)
resource "azurerm_container_app" "llm_service" {
  name                         = "llm-service"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  
  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    container {
      name   = "ollama"
      image  = "${azurerm_container_registry.main.login_server}/llm-service:latest"
      cpu    = 2.0     # Ollama needs more CPU
      memory = "4.0Gi" # Max allowed for Consumption plan (Standard Serverless)

      # If you need to map a volume for models later, add volume_mounts here
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = false # Internal usage only (called by Gateway)
    target_port                = 11434
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# 3. RAG Service (FAISS)
resource "azurerm_container_app" "rag_service" {
  name                         = "rag-service"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    container {
      name   = "rag-service"
      image  = "${azurerm_container_registry.main.login_server}/rag-service:latest"
      cpu    = 1.0
      memory = "2.0Gi"

      env {
        name  = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }
      
      env {
        name  = "BLOB_CONTAINER_NAME"
        value = "rag-state"
      }
    }
  }
  
  secret {
    name  = "storage-connection-string"
    value = azurerm_storage_account.app_data.primary_connection_string
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = false # Internal usage only
    target_port                = 80
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# 4. Speech Service (TTS/STT)
resource "azurerm_container_app" "speech_service" {
  name                         = "speech-service"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  
  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    container {
      name   = "speech-service"
      image  = "${azurerm_container_registry.main.login_server}/speech-service:latest"
      cpu    = 1.0
      memory = "2.0Gi"

      env {
        name  = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }
      
      env {
        name  = "AUDIO_CONTAINER_NAME"
        value = "public-audio"
      }
    }
  }
  
  secret {
    name  = "storage-connection-string"
    value = azurerm_storage_account.app_data.primary_connection_string
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = false # Internal usage only
    target_port                = 80
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
