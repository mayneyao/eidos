/**
 * Global request manager to prevent duplicate checkAndFetchTable requests for the same table
 */
class TableRequestManager {
  private pendingRequests = new Map<string, Promise<void>>()

  /**
   * Check if there's a pending request
   */
  hasPendingRequest(tableId: string): boolean {
    return this.pendingRequests.has(tableId)
  }

  /**
   * Get the pending request
   */
  getPendingRequest(tableId: string): Promise<void> | undefined {
    return this.pendingRequests.get(tableId)
  }

  /**
   * Set a pending request
   */
  setPendingRequest(tableId: string, request: Promise<void>): void {
    this.pendingRequests.set(tableId, request)
  }

  /**
   * Clear a completed request
   */
  clearPendingRequest(tableId: string): void {
    this.pendingRequests.delete(tableId)
  }

  /**
   * Execute request, wait for existing request if one is already in progress for the same table
   */
  async executeRequest<T>(
    tableId: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // If there's already a request in progress for the same table, wait for it
    const existingRequest = this.getPendingRequest(tableId)
    if (existingRequest) {
      await existingRequest
      // After waiting, check if we still need to execute the request
      // because the other request might have completed what we need
      return requestFn()
    }

    // Create a new request
    const request = this.executeRequestInternal(tableId, requestFn)
    // Convert Promise<T> to Promise<void> for storage
    this.setPendingRequest(tableId, request.then(() => {}))

    try {
      const result = await request
      return result
    } finally {
      this.clearPendingRequest(tableId)
    }
  }

  private async executeRequestInternal<T>(
    tableId: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    return requestFn()
  }
}

// Export singleton instance
export const tableRequestManager = new TableRequestManager()
