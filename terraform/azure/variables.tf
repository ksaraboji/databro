variable "environment" {
  description = "The environment (dev, prod)"
  type        = string
}

variable "location" {
  description = "The Azure Region"
  type        = string
  default     = "East US"
}

variable "devto_api_key" {
  description = "API Key for Dev.to publishing"
  type        = string
  sensitive   = true
}

variable "hf_api_key" {
  description = "Hugging Face API Key"
  type        = string
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq API Key"
  type        = string
  sensitive   = true
}
