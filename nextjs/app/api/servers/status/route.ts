import { NextResponse } from "next/server";

const MODEL_INTERPRETATION_BASE_URL =
  process.env.MODEL_INTERPRETATION_URL || "http://localhost:3001";

const DATABASE_QUERY_BASE_URL =
  process.env.DATABASE_QUERY_URL || "http://localhost:3002";

interface ServerStatus {
  name: string;
  url: string;
  connected: boolean;
  error?: string;
  version?: string;
  details?: Record<string, unknown>;
}

async function checkServerHealth(
  name: string,
  url: string
): Promise<ServerStatus> {
  try {
    const healthUrl = `${url}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store", // Prevent caching
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        name,
        url,
        connected: true,
        version: data.version,
        details: data,
      };
    } else {
      return {
        name,
        url,
        connected: false,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    // Handle connection refused, timeout, and other network errors
    let errorMessage = "Connection failed";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Timeout";
      } else if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
        errorMessage = "Connection refused";
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      name,
      url,
      connected: false,
      error: errorMessage,
    };
  }
}

export async function GET() {
  try {
    const [modelInterpretation, databaseQuery] = await Promise.all([
      checkServerHealth("Model Interpretation", MODEL_INTERPRETATION_BASE_URL),
      checkServerHealth("Database Query", DATABASE_QUERY_BASE_URL),
    ]);

    return NextResponse.json(
      {
        servers: [modelInterpretation, databaseQuery],
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error) {
    console.error("Error checking server status:", error);
    // Return default disconnected status for both servers
    return NextResponse.json(
      {
        servers: [
          {
            name: "Model Interpretation",
            url: MODEL_INTERPRETATION_BASE_URL,
            connected: false,
            error: "Failed to check status",
          },
          {
            name: "Database Query",
            url: DATABASE_QUERY_BASE_URL,
            connected: false,
            error: "Failed to check status",
          },
        ],
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  }
}

