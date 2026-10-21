declare namespace App {
  interface Locals {
    apiClient: import('./lib/api/api-client').ApiClient;
    /** The signed-in account; null or absent for a visitor. */
    user?: import('./lib/api/types').CurrentAccount | null;
  }
}
