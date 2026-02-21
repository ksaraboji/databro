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

  secret {
    name  = "devto-api-key"
    value = var.devto_api_key
  }

  secret {
    name  = "hf-api-key"
    value = var.hf_api_key
  }

  secret {
    name  = "groq-api-key"
    value = var.groq_api_key
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
        name        = "DEVTO_API_KEY"
        secret_name = "devto-api-key"
      }
      env {
        name        = "HF_API_KEY"
        secret_name = "hf-api-key"
      }
      env {
        name        = "GROQ_API_KEY"
        secret_name = "groq-api-key"
      }
      env {
        name        = "COSMOS_DATABASE"
        value       = azurerm_cosmosdb_sql_database.main.name
      }
      env {
        name        = "COSMOS_CONTAINER"
        value       = azurerm_cosmosdb_sql_container.visitors.name
      }

      # Startup Probe: Wait for app to be ready
      startup_probe {
        transport               = "HTTP"
        port                    = 80
        path                    = "/health" 
        header {
          name  = "Custom-Header"
          value = "Awesome"
        }
        # Correct argument name is 'interval_seconds', 'timeout' etc.
        # But 'initial_delay' is actually not supported in some versions?
        # Checking docs again: 'initial_delay' IS supported in provider 4.x?
        # Ah, for 'startup_probe' specifically, checking the attributes...
        # Wait, the error said "An argument named 'initial_delay' is not expected here."
        # Maybe it wants 'initial_delay_seconds' ?? I used that first and it failed.
        # Wait, the FIRST error I got was "Blocks of type 'probe' are not expected here."
        # Checking the provider docs excerpt I have...
        # "A liveness_probe block supports... initial_delay"
        # "A startup_probe block supports... initial_delay"
        # They seem to support 'initial_delay' (seconds).
        # Let's try removing it temporarily or trying 'initial_delay_step'? No.
        # Let's try 'initial_delay_seconds' AGAIN but inside the correct BLOCK type.
        # My first attempt used 'probe' block (wrong) with 'initial_delay_seconds' (maybe right?).
        # Now I am using 'startup_probe' (right) with 'initial_delay' (maybe wrong).
        
        # The docs says: "initial_delay - (Optional) The number of seconds..."
        # BUT terraform providers often alias things. 
        # Let's try 'time_before_start' ? No.
        
        # Wait, I see "initial_delay_seconds" commonly used in k8s.
        # But the doc excerpt says "initial_delay".
        
        # Let's look closely at the doc excerpt:
        # "initial_delay - (Optional) The number of seconds..."
        
        # Maybe I am using an old provider version?
        # main.tf says "version = ~> 3.0".
        # In 3.x, maybe it was different?
        
        # Let's try to remove it for now to unblock, or try 'initial_delay_seconds' inside 'startup_probe'.
        # I will try 'initial_delay' -> 'timeout' works?
        # I'll try changing it to 'initial_delay_seconds' JUST IN CASE. 
        # Actually... `azurerm_container_group` uses `initial_delay_seconds`.
        # `azurerm_container_app` usually mirrors the ARM template or YAML.
        
        # I will delete `initial_delay` for a moment to see if it passes.
        
        interval_seconds        = 5 
        timeout                 = 5
        failure_count_threshold = 10
      }
      
      liveness_probe {
        transport               = "HTTP"
        port                    = 80
        path                    = "/health"
        header {
          name  = "Custom-Header"
          value = "Awesome"
        }
        interval_seconds        = 10
        timeout                 = 5
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
