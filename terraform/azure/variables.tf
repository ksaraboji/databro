variable "environment" {
  description = "The environment (dev, prod)"
  type        = string
}

variable "location" {
  description = "The Azure Region"
  type        = string
  default     = "East US"
}
