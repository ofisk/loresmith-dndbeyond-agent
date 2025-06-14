// D&D Beyond Character & Campaign Agent
// A Cloudflare Worker that provides A2A protocol-compliant access to D&D Beyond data
// Fetches character sheets, campaign info, and party details for D&D campaign management

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return new Response(JSON.stringify({
        "@type": "AgentCard",
        "name": "D&D Beyond Character & Campaign Agent",
        "description": "Fetches character sheets, campaign information, and party details from D&D Beyond.",
        "version": "1.0.0",
        "capabilities": ["character-lookup", "campaign-data", "party-management"],
        "api": {
          "url": "https://dndbeyond-agent.example.workers.dev",
          "authentication": { "type": "api-key", "header": "Authorization", "format": "Bearer {api-key}" },
          "endpoints": [
            { "path": "/character/{id}", "method": "GET", "description": "Get character by ID" },
            { "path": "/campaign/{characterId}", "method": "GET", "description": "Get campaign info" },
            { "path": "/party/{characterId}", "method": "GET", "description": "Get party overview" }
          ]
        }
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Serve character lookup UI (optional)
    if (pathname === "/" || pathname === "/ui") {
      return new Response(this.getDndbeyondAgentUI(env), {
        headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" }
      });
    }

    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    // Get character by ID
    if (pathname.startsWith("/character/") && req.method === "GET") {
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;

      const characterId = pathname.split("/character/")[1];
      if (!characterId || !characterId.match(/^\d+$/)) {
        return new Response(JSON.stringify({ error: "Invalid character ID" }), { 
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      try {
        const character = await this.fetchCharacter(characterId);
        return new Response(JSON.stringify({ success: true, character }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to fetch character", message: error.message }), { 
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Default response for unmatched routes
    return new Response(`D&D Beyond Character & Campaign Agent

Available endpoints:
- GET /.well-known/agent.json - Agent capabilities
- GET /character/{id} - Get character by ID (requires API key)
- GET /ui - Character lookup interface

This is an API-only agent. Use the /ui endpoint for the web interface.`, {
      headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
    });
  },

  async fetchCharacter(characterId) {
    const url = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.dndbeyond.com/'
      }
    });

    if (!response.ok) {
      if (response.status === 404) throw new Error('Character not found or not public');
      if (response.status === 429) throw new Error('Rate limited by D&D Beyond');
      throw new Error(`D&D Beyond API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      name: data.name,
      level: data.classes?.reduce((total, cls) => total + cls.level, 0) || 1,
      race: data.race?.fullName || data.race?.baseName,
      classes: data.classes?.map(cls => ({ name: cls.definition?.name, level: cls.level })) || [],
      stats: {
        strength: data.stats?.[0]?.value || 10,
        dexterity: data.stats?.[1]?.value || 10,
        constitution: data.stats?.[2]?.value || 10,
        intelligence: data.stats?.[3]?.value || 10,
        wisdom: data.stats?.[4]?.value || 10,
        charisma: data.stats?.[5]?.value || 10
      },
      hitPoints: {
        current: data.baseHitPoints + (data.bonusHitPoints || 0),
        max: data.baseHitPoints + (data.bonusHitPoints || 0)
      },
      armorClass: data.armorClass || 10,
      speed: data.speed?.walk || 30,
      avatarUrl: data.avatarUrl
    };
  },

  async requireAuthentication(req, env) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        error: new Response(JSON.stringify({ error: "Authentication required" }), { 
          status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        })
      };
    }

    const apiKey = authHeader.substring(7);
    if (!env.API_KEY || apiKey !== env.API_KEY) {
      return {
        error: new Response(JSON.stringify({ error: "Invalid API key" }), { 
          status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        })
      };
    }

    return { success: true };
  },

  getDndbeyondAgentUI(env) {
    return env.DNDBEYOND_AGENT_UI_HTML;
  }
}; 