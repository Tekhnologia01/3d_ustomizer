// Tripo.ai API service for product 3D model generation

const API_BASE_URL = 'http://127.0.0.1:8000/api'; // Update this to your backend URL

export interface TripoTaskStatus {
  success: boolean;
  task_id: string;
  status: string;
  progress: number;
  model_url?: string;
  rendered_image_url?: string;
}

/**
 * Generate 3D model for a product using Tripo.ai
 * This calls the existing backend endpoint that handles the product's image
 * @param productId - The product ID to generate 3D model for
 * @param textureQuality - Texture quality: 'standard', 'detailed' (HD), or 'extreme' (8K)
 * @returns Promise with task response containing task_id
 */
export async function generateProduct3D(productId: number, textureQuality: 'standard' | 'detailed' | 'extreme' = 'standard'): Promise<{ success: boolean; task_id: string; status: string }> {
  try {
    const formData = new FormData();
    formData.append('texture_quality', textureQuality);

    const response = await fetch(`${API_BASE_URL}/products/${productId}/generate-3d/`, {
      method: 'POST',
      headers: {
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Include debug info if available
      const errorMessage = errorData.error || 'Failed to generate 3D model';
      const debugInfo = errorData.debug_info ? ` (Debug: ${JSON.stringify(errorData.debug_info)})` : '';
      throw new Error(errorMessage + debugInfo);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating product 3D model:', error);
    throw error;
  }
}

/**
 * Check the status of a Tripo 3D generation task
 * @param taskId - The task ID to check
 * @returns Promise with task status information
 */
export async function getTripoTaskStatus(taskId: string): Promise<TripoTaskStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/tripo/task-status/${taskId}/`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get task status');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting task status:', error);
    throw error;
  }
}

/**
 * Poll the task status until completion or failure
 * @param taskId - The task ID to poll
 * @param onProgress - Callback function for progress updates
 * @param pollInterval - Polling interval in milliseconds (default: 2000)
 * @param timeout - Timeout in milliseconds (default: 300000 = 5 minutes)
 * @returns Promise with final task status when complete
 */
export async function pollTripoTask(
  taskId: string,
  onProgress?: (progress: number, status: string) => void,
  pollInterval: number = 2000,
  timeout: number = 300000
): Promise<TripoTaskStatus> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await getTripoTaskStatus(taskId);
      
      if (onProgress) {
        onProgress(status.progress, status.status);
      }
      
      if (status.status === 'success') {
        return status;
      }
      
      if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'banned') {
        throw new Error(`Task ${status.status}`);
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Error polling task status:', error);
      throw error;
    }
  }
  
  throw new Error(`Task timed out after ${timeout/1000} seconds`);
}

/**
 * Complete the Tripo generation by downloading and storing the 3D model
 * @param taskId - The Tripo task ID
 * @param productId - The product ID to associate the model with
 * @returns Promise with the stored model URL and preview URL
 */
export async function completeTripoGeneration(taskId: string, productId: number): Promise<{ success: boolean; model_url: string; preview_url?: string; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/tripo/complete-generation/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: taskId,
        product_id: productId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to complete Tripo generation');
    }

    return await response.json();
  } catch (error) {
    console.error('Error completing Tripo generation:', error);
    throw error;
  }
}