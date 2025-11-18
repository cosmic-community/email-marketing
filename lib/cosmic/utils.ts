// Helper function to check if an error has a status property
export function hasStatus(error: any): error is { status: number } {
  return typeof error === "object" && error !== null && "status" in error;
}

// Timeout wrapper for long-running operations
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 30000, // 30 second default timeout
  operationName: string = "operation"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

