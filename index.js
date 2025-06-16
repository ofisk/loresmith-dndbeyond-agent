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
          "authentication": { "type": "none" },
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

    // Serve UI chunks for main agent integration
    if (pathname === "/ui-chunk" && req.method === "GET") {
      return this.handleUIChunk(req);
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
- GET /character/{id} - Get character by ID (public access)
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

  // Handle UI chunk requests for main agent integration
  async handleUIChunk(req) {
    const url = new URL(req.url);
    const step = url.searchParams.get('step') || '1';
    
    // Return a simple D&D Beyond character lookup interface
    const uiChunk = {
      success: true,
      title: '🐉 D&D Beyond Character Lookup',
      html: `
        <div class="agent-ui-chunk">
          <div class="prompt">
            <h3>🐉 D&D Beyond Character Lookup</h3>
            <p>Access public character sheets and campaign information from D&D Beyond.</p>
          </div>
          
          <div class="section">
            <h4>Character Lookup</h4>
            <div class="input-group">
              <label for="dndCharacterId">Character ID</label>
              <input type="number" id="dndCharacterId" placeholder="Enter D&D Beyond character ID">
              <small>Note: Only public characters can be accessed</small>
            </div>
            
            <div class="actions">
              <button class="btn btn-primary" onclick="lookupDndCharacter()">Get Character</button>
            </div>
            
            <div id="dndCharacterResult" class="character-result" style="display: none;"></div>
          </div>
        </div>
      `,
      scripts: this.getDndAgentScripts()
    };

    return new Response(JSON.stringify(uiChunk), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },

  // Get D&D Beyond agent JavaScript functions for UI chunks
  getDndAgentScripts() {
    return `
      async function lookupDndCharacter() {
        const characterIdInput = document.getElementById('dndCharacterId');
        const characterId = characterIdInput.value.trim();
        
        if (!characterId) {
          showAgentStatus('Please enter a character ID', 'error');
          return;
        }
        
        try {
          showAgentStatus('Looking up character...', 'info');
          const response = await fetch('./character/' + characterId);
          
          if (!response.ok) {
            throw new Error('Character not found or not public');
          }
          
          const result = await response.json();
          if (result.success) {
            displayDndCharacter(result.character);
            hideAgentStatus();
          } else {
            throw new Error(result.error || 'Failed to fetch character');
          }
          
        } catch (error) {
          showAgentStatus('Error looking up character: ' + error.message, 'error');
        }
      }
      
      function displayDndCharacter(character) {
        const resultDiv = document.getElementById('dndCharacterResult');
        if (!resultDiv) return;
        
        let html = '<div class="character-display">';
        html += '<h4>' + character.name + '</h4>';
        
        if (character.classes && character.classes.length > 0) {
          const classInfo = character.classes.map(c => c.name + ' ' + c.level).join(', ');
          html += '<p><strong>Classes:</strong> ' + classInfo + '</p>';
        }
        
        html += '<p><strong>Level:</strong> ' + character.level + '</p>';
        
        if (character.race) {
          html += '<p><strong>Race:</strong> ' + character.race + '</p>';
        }
        
        if (character.hitPoints) {
          html += '<p><strong>Hit Points:</strong> ' + character.hitPoints.current + '/' + character.hitPoints.max + '</p>';
        }
        
        if (character.armorClass) {
          html += '<p><strong>Armor Class:</strong> ' + character.armorClass + '</p>';
        }
        
        if (character.stats) {
          html += '<div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px;">';
          html += '<div><strong>STR:</strong> ' + character.stats.strength + '</div>';
          html += '<div><strong>DEX:</strong> ' + character.stats.dexterity + '</div>';
          html += '<div><strong>CON:</strong> ' + character.stats.constitution + '</div>';
          html += '<div><strong>INT:</strong> ' + character.stats.intelligence + '</div>';
          html += '<div><strong>WIS:</strong> ' + character.stats.wisdom + '</div>';
          html += '<div><strong>CHA:</strong> ' + character.stats.charisma + '</div>';
          html += '</div>';
        }
        
        html += '</div>';
        
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
      }
    `;
  },

  getDndbeyondAgentUI(env) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D&D Beyond Character Lookup</title>
    <style>
        body { font-family: system-ui; background: linear-gradient(135deg, #8B0000, #DC143C); min-height: 100vh; padding: 20px; margin: 0; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #8B0000, #DC143C); color: white; padding: 30px; text-align: center; border-radius: 20px 20px 0 0; }
        .header h1 { font-size: 2.5em; margin: 0 0 10px 0; }
        .content { padding: 40px; }
        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; margin-bottom: 5px; font-weight: 600; color: #8B0000; }
        .input-group input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; }
        .btn { background: linear-gradient(135deg, #DC143C, #8B0000); color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; margin: 5px; }
        .status { padding: 15px; border-radius: 8px; margin: 15px 0; display: none; }
        .status.success { background: #d5f4e6; color: #27ae60; }
        .status.error { background: #f8d7da; color: #721c24; }
        .status.info { background: #cce7ff; color: #0066cc; }
        .character-card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 15px 0; }
        .character-name { font-size: 1.5em; font-weight: bold; color: #8B0000; margin-bottom: 10px; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        .stat-block { background: white; padding: 10px; border-radius: 5px; text-align: center; }
        .stat-value { font-size: 1.2em; font-weight: bold; color: #DC143C; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐉 D&D Beyond Character Lookup</h1>
            <p>Access public character sheets and campaign information</p>
        </div>
        <div class="content">
            <div class="input-group">
                <label for="characterId">Character ID</label>
                <input type="number" id="characterId" placeholder="Enter D&D Beyond character ID">
                <small style="color: #666; font-size: 0.9em;">Note: Only public characters can be accessed</small>
            </div>
            
            <button class="btn" onclick="lookupCharacter()">Get Character</button>
            
            <div class="status" id="status"></div>
            <div id="results"></div>
        </div>
    </div>

    <script>
        function showStatus(type, message) {
            const status = document.getElementById('status');
            status.className = 'status ' + type;
            status.textContent = message;
            status.style.display = 'block';
        }
        
        async function lookupCharacter() {
            const characterId = document.getElementById('characterId').value.trim();
            
            if (!characterId) {
                showStatus('error', 'Please enter a character ID');
                return;
            }
            
            showStatus('info', 'Looking up character...');
            
            try {
                const response = await fetch(\`./character/\${characterId}\`);
                
                const result = await response.json();
                
                if (result.success) {
                    displayCharacter(result.character);
                    showStatus('success', 'Character loaded successfully!');
                } else {
                    throw new Error(result.message || 'Failed to load character');
                }
            } catch (error) {
                showStatus('error', 'Error: ' + error.message);
            }
        }
        
        function displayCharacter(character) {
            const results = document.getElementById('results');
            results.innerHTML = \`
                <div class="character-card">
                    <div class="character-name">\${character.name}</div>
                    <p>Level \${character.level} \${character.race} \${character.classes.map(c => c.name).join('/')}</p>
                    
                    <div class="stat-grid">
                        <div class="stat-block">
                            <div>Hit Points</div>
                            <div class="stat-value">\${character.hitPoints.current}/\${character.hitPoints.max}</div>
                        </div>
                        <div class="stat-block">
                            <div>AC</div>
                            <div class="stat-value">\${character.armorClass}</div>
                        </div>
                        <div class="stat-block">
                            <div>Speed</div>
                            <div class="stat-value">\${character.speed}</div>
                        </div>
                        <div class="stat-block">
                            <div>STR</div>
                            <div class="stat-value">\${character.stats.strength}</div>
                        </div>
                        <div class="stat-block">
                            <div>DEX</div>
                            <div class="stat-value">\${character.stats.dexterity}</div>
                        </div>
                        <div class="stat-block">
                            <div>CON</div>
                            <div class="stat-value">\${character.stats.constitution}</div>
                        </div>
                        <div class="stat-block">
                            <div>INT</div>
                            <div class="stat-value">\${character.stats.intelligence}</div>
                        </div>
                        <div class="stat-block">
                            <div>WIS</div>
                            <div class="stat-value">\${character.stats.wisdom}</div>
                        </div>
                        <div class="stat-block">
                            <div>CHA</div>
                            <div class="stat-value">\${character.stats.charisma}</div>
                        </div>
                    </div>
                </div>
            \`;
        }
    </script>
</body>
</html>`;
  }
}; 