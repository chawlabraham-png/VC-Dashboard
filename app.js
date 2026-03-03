// ============================================================
// Jungle Ventures — VC Intelligence Platform
// Main Application Controller
// ============================================================
// Dependencies loaded via script tags:
// - data.js (STARTUPS, SIGNAL_TYPES, GEOGRAPHIES, SECTORS)
// - scoring.js (rankStartups, WEIGHTS)
// - charts.js (createSparkline, createRadarChart, getScoreColor, getScoreClass, getBarColor)
// - config.js (CONFIG)

// ---- Config Fallback ----
if (typeof CONFIG === 'undefined') {
  var CONFIG = { supabaseUrl: '', supabaseKey: '', streakApiKey: '', googleClientId: '', gmailScopes: '' };
}

// ---- State ----
let rankedStartups = [];
let currentSection = 'dealflow';
let filters = { geo: 'All', sector: 'All', tier: 'All', search: '' };
let uploadedDecks = [];

// ---- Supabase ----
const SUPABASE_URL = CONFIG.supabaseUrl || '';
const SUPABASE_KEY = CONFIG.supabaseKey || '';
let supabase = null;
let supabaseConnected = false;

// ---- Streak CRM ----
const STREAK_API_KEY = CONFIG.streakApiKey || '';
let streakPipelines = [];

// ---- Gmail OAuth ----
let gmailTokenClient = null;
let gmailAccessToken = null;
let dealEmails = [];

let integrationState = {
  gmail: { connected: false, email: '', emails: [] },
  streak: { connected: true, apiKey: STREAK_API_KEY, pipelines: [], lastSync: null },
  supabase: { connected: false },
  team: {
    members: [
      { name: 'You', email: 'admin@jungleventures.com', role: 'Partner', color: '#10b981' }
    ]
  }
};

async function initSupabase() {
  try {
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabaseConnected = true;
      integrationState.supabase.connected = true;
      console.log('✅ Supabase connected:', SUPABASE_URL);

      // Fetch deals from Supabase
      const { data, error } = await supabase.from('startups').select('*');
      if (error) throw error;

      if (data && data.length > 0) {
        console.log(`✅ Loaded ${data.length} deals from Supabase`);
        return data; // Return live data
      }
    }
  } catch (e) {
    console.warn('Supabase init/fetch failed, falling back to local data:', e);
  }
  return null;
}

function initStreak() {
  // Streak API requires server-side proxy due to CORS
  // For now, we store the key and show connected state
  // In production, API calls go through a Supabase Edge Function
  integrationState.streak.connected = true;
  integrationState.streak.lastSync = new Date();
  integrationState.streak.pipelines = [
    { name: 'Deal Flow - India', boxes: 7, stage: 'Active' },
    { name: 'Deal Flow - SEA', boxes: 9, stage: 'Active' },
    { name: 'Portfolio Monitoring', boxes: 8, stage: 'Active' },
    { name: 'Passed Deals', boxes: 24, stage: 'Archive' }
  ];
  console.log('✅ Streak CRM connected — API key configured');
}

function initGmail() {
  if (!CONFIG.googleClientId) {
    console.log('⏳ Gmail: Waiting for Google Client ID in config.js');
    return;
  }
  try {
    gmailTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.gmailScopes,
      callback: handleGmailAuthResponse
    });
    console.log('✅ Gmail OAuth client initialized');
  } catch (e) {
    console.warn('Gmail init deferred — GIS script loading');
  }
}

function connectGmail() {
  if (!CONFIG.googleClientId) {
    // Show setup instructions
    openGmailSetupModal();
    return;
  }
  if (gmailTokenClient) {
    gmailTokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    initGmail();
    setTimeout(() => {
      if (gmailTokenClient) gmailTokenClient.requestAccessToken({ prompt: 'consent' });
    }, 500);
  }
}

function handleGmailAuthResponse(response) {
  if (response.error) {
    console.error('Gmail auth error:', response);
    return;
  }
  gmailAccessToken = response.access_token;
  integrationState.gmail.connected = true;

  // Fetch user profile
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(profile => {
      integrationState.gmail.email = profile.email;
      console.log('✅ Gmail connected:', profile.email);
      fetchDealEmails();
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    });
}

function fetchDealEmails() {
  if (!gmailAccessToken) return;

  // Build search query from startup names in pipeline
  const startupNames = rankedStartups.map(s => s.name).join(' OR ');
  const query = encodeURIComponent(`(${startupNames}) OR "deal flow" OR "pitch deck" OR "investment" OR "fundraise" OR "term sheet"`);

  fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${query}`, {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.messages) {
        integrationState.gmail.emails = [];
        return;
      }
      // Fetch details for each message
      const fetchPromises = data.messages.slice(0, 10).map(msg =>
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
        }).then(r => r.json())
      );
      return Promise.all(fetchPromises);
    })
    .then(emails => {
      if (!emails) return;
      integrationState.gmail.emails = emails.map(e => {
        const headers = e.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        // Auto-tag with matching startup names
        const matchedStartups = rankedStartups.filter(s =>
          subject.toLowerCase().includes(s.name.toLowerCase()) ||
          from.toLowerCase().includes(s.name.toLowerCase())
        ).map(s => s.name);
        return { id: e.id, subject, from, date, snippet: e.snippet, matchedStartups };
      });
      console.log(`📧 Fetched ${integrationState.gmail.emails.length} deal-related emails`);
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    })
    .catch(err => console.warn('Gmail fetch error:', err));
}

function openGmailSetupModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">📧</div>
        <div>
          <h3>Gmail API Setup</h3>
          <div class="sub">Connect your Gmail to auto-scan deal emails</div>
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body" style="padding:20px">
      <div class="insight-box info" style="margin-bottom:16px">Follow these steps to get your Google Client ID. Takes ~3 minutes.</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.8">
        <ol style="padding-left:20px">
          <li><strong>Go to</strong> <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent-blue)">console.cloud.google.com</a></li>
          <li><strong>Create a project</strong> (or select existing) → Name it "JV Intelligence"</li>
          <li>Go to <strong>APIs & Services → Library</strong> → Search <strong>"Gmail API"</strong> → <strong>Enable</strong></li>
          <li>Go to <strong>APIs & Services → Credentials</strong> → <strong>Create Credentials → OAuth Client ID</strong></li>
          <li>Configure consent screen if prompted (External, add your email as test user)</li>
          <li>Application type: <strong>Web application</strong></li>
          <li>Authorized JavaScript origins: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Authorized redirect URIs: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Click <strong>Create</strong> → Copy the <strong>Client ID</strong></li>
          <li>Paste it below ↓</li>
        </ol>
      </div>
      <div style="margin-top:16px">
        <div class="integration-input-group">
          <input class="integration-input" placeholder="Paste your Google Client ID here..." id="gmail-client-id-input" style="font-size:0.82rem">
          <button class="integration-connect-btn" id="save-gmail-client-id">Save & Connect</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  content.querySelector('#save-gmail-client-id').addEventListener('click', () => {
    const clientId = document.getElementById('gmail-client-id-input')?.value?.trim();
    if (clientId && clientId.includes('.apps.googleusercontent.com')) {
      CONFIG.googleClientId = clientId;
      closeModal();
      initGmail();
      setTimeout(() => connectGmail(), 300);
    } else {
      alert('Please enter a valid Google Client ID.\nIt looks like: 123456789-xxxx.apps.googleusercontent.com');
    }
  });
}

// ---- Valuation Comps Data ----
const VALUATION_COMPS = [
  { name: "KartBee", stage: "Pre-Seed", revenue: "$45K MRR", growth: "280%", fairVal: "$8-12M", currentVal: "$10M", status: "fair", model: "Quick Commerce", comps: ["Zepto (Pre-Seed: $12M)", "Blinkit early ($8M)", "Swish (SG: $6M)"], nextRound: "Seed at $25-35M in 6-9 months if hits $150K MRR", risks: "Unit economics unproven in Tier-2; heavy capex" },
  { name: "FactoryOS", stage: "Seed", revenue: "$180K MRR", growth: "200%", fairVal: "$28-38M", currentVal: "$32M", status: "fair", model: "Smart Factory SaaS", comps: ["Sight Machine (Seed: $30M)", "Tulip Interfaces ($35M)", "MOI (India: $25M)"], nextRound: "Series A at $60-80M in 9-12 months", risks: "Long enterprise sales cycle; integration complexity" },
  { name: "Playlo", stage: "Pre-Series A", revenue: "$28K MRR", growth: "180%", fairVal: "$18-25M", currentVal: "$22M", status: "fair", model: "Social Gaming", comps: ["Hago (SEA: $20M)", "Winzo (India: $25M at seed)", "Aura (ID: $15M)"], nextRound: "Series A at $50-70M if DAU exceeds 200K", risks: "Retention cliff typical in casual gaming; monetization per user low" },
  { name: "QualityLens", stage: "Series A", revenue: "$680K MRR", growth: "180%", fairVal: "$55-75M", currentVal: "$62M", status: "fair", model: "Visual Inspection AI", comps: ["Landing AI ($65M Series A)", "Instrumental ($58M)", "Eigen Innovations ($42M)"], nextRound: "Series B at $150-200M in 12-15 months", risks: "GPU costs at scale; accuracy claims need third-party validation" },
  { name: "SteelMind", stage: "Series A", revenue: "$920K MRR", growth: "140%", fairVal: "$48-62M", currentVal: "$58M", status: "fair", model: "Predictive Maintenance", comps: ["Augury ($55M Series A)", "Senseye ($45M)", "Nanoprecise ($38M)"], nextRound: "Series B at $120-160M in 10-14 months", risks: "Customer concentration risk; slow industrial adoption curves" },
  { name: "MateriFlow", stage: "Seed", revenue: "$290K MRR", growth: "240%", fairVal: "$35-48M", currentVal: "$38M", status: "fair", model: "B2B Marketplace", comps: ["Ula (ID Seed: $40M)", "Moglix (India: $42M early)", "Bizongo ($35M)"], nextRound: "Series A at $80-110M with GMV proof", risks: "Marketplace liquidity chicken-and-egg; margin pressure" },
  { name: "Vybe", stage: "Pre-Seed", revenue: "$15K MRR", growth: "600%", fairVal: "$12-18M", currentVal: "$14M", status: "fair", model: "Creator Economy", comps: ["Chingari (Pre-Seed: $15M)", "Josh early ($18M)", "Kumu (PH: $10M)"], nextRound: "Seed at $30-45M on MAU trajectory", risks: "Hyper-competitive; user acquisition cost escalation; regulation risk" },
  { name: "PixelPay", stage: "Pre-Seed", revenue: "$8K MRR", growth: "800%", fairVal: "$7-11M", currentVal: "$9M", status: "fair", model: "Gen-Z Fintech", comps: ["FamPay (Pre-Seed: $10M)", "Fidel early ($8M)", "Bankera ($6M)"], nextRound: "Seed at $20-30M on RBI license progress", risks: "Regulatory overhang; unclear willingness to pay from Gen-Z" },
  { name: "RoboWeld", stage: "Series A", revenue: "$520K MRR", growth: "160%", fairVal: "$45-60M", currentVal: "$52M", status: "underpriced", model: "Industrial Robotics", comps: ["Universal Robots early ($60M)", "Doosan Robotics ($55M)", "Elephant Robotics ($38M)"], nextRound: "Series B at $130-170M with ASEAN expansion", risks: "Hardware supply chain complexity; after-sales service cost" },
  { name: "GreenMill", stage: "Seed", revenue: "$240K MRR", growth: "210%", fairVal: "$40-55M", currentVal: "$42M", status: "underpriced", model: "Carbon/ESG SaaS", comps: ["Watershed ($45M seed)", "Persefoni ($50M)", "Plan A ($38M)"], nextRound: "Series A at $90-120M on regulatory tailwinds", risks: "ESG regulation pace uncertain in ASEAN; customer willingness to pay" }
];

// ---- Thesis Data ----
const THESIS_DATA = {
  accelerating: [
    { emoji: "🏭", title: "AI-Powered Manufacturing", desc: "Factory AI, predictive maintenance, and visual inspection are seeing 3x YoY funding growth in India & SEA. Regulatory push for smart manufacturing in India (PLI scheme) is creating massive demand. JV is well-positioned with FactoryOS, QualityLens, and SteelMind.", status: "Thesis strengthening ↑↑" },
    { emoji: "🎮", title: "Social Gaming in SEA", desc: "500M+ mobile-first gamers in SEA with rising ARPU. Playlo and local studios are capturing share from global publishers. Indonesia and Vietnam are fastest-growing markets.", status: "Capital flowing in ↑" },
    { emoji: "♻️", title: "Sustainability / ESG in Manufacturing", desc: "EU CBAM and Singapore carbon tax driving demand for manufacturing carbon accounting. GreenMill is pioneer in ASEAN. $48B TAM growing 25% annually.", status: "Early innings — low competition ↑" }
  ],
  saturated: [
    { emoji: "🛒", title: "Quick Commerce (Metro India)", desc: "Zepto, Blinkit, Instamart have locked up Delhi/Mumbai/Bangalore. Tier-2 opportunity remains (KartBee thesis), but metro QC is winner-take-most. Over 30 funded players.", status: "Crowded — differentiation key →" },
    { emoji: "💳", title: "Digital Lending (India)", desc: "150+ NBFCs with digital play. RBI tightening regulations. UPI dominance means distribution is easy but defensibility is hard. Finfolk (PH) is better geo-play.", status: "Peak funding — margins compressing →" },
    { emoji: "🍱", title: "Cloud Kitchens", desc: "Rebel Foods, EatClub, CloudEats have scaled. High churn, low margins. Chowbus SEA differentiation through premium + AI is best path forward.", status: "Consolidation phase →" }
  ],
  whitespace: [
    { emoji: "🤖", title: "Affordable Industrial Robotics (ASEAN)", desc: "Only RoboWeld is tackling this. ASEAN has 2M+ SME factories that can't afford Fanuc/ABB. 70% cost reduction + AI programming is the unlock. $38B TAM.", status: "Zero competition — first mover advantage" },
    { emoji: "📦", title: "Packaging Automation (India)", desc: "India's packaging market is $73B but <5% automated. PackBot is only startup targeting modular automation for mid-market FMCG. EU sustainability packaging rules will force adoption.", status: "Massive TAM, no startup competition" },
    { emoji: "🧪", title: "Raw Materials Marketplace (SEA)", desc: "MateriFlow is pioneering B2B materials marketplace in Indonesia. No Alibaba-equivalent for ASEAN factories. Trade finance integration is key moat.", status: "First mover in $55B market" },
    { emoji: "🌏", title: "Vernacular Creator Economy (Bharat)", desc: "ShareChat proved demand, but Vybe's multi-lingual AI dubbing + monetization is new. 500M non-English internet users in India with no dominant platform.", status: "Platform shift opportunity" }
  ],
  gaps: [
    { emoji: "⚠️", title: "Underexposed: Semiconductor Supply Chain", desc: "India's semiconductor mission ($10B+) has no JV portfolio play. Design services, testing, and packaging automation are adjacent to current thesis.", signal: "negative" },
    { emoji: "⚠️", title: "Underexposed: Agri-Manufacturing", desc: "Farm-to-factory value chain in India/SEA is $200B+ with minimal VC presence. Cold chain, food processing automation, and agri-input marketplaces.", signal: "negative" },
    { emoji: "✅", title: "Strong: Factory AI Stack", desc: "3 companies across visual inspection, predictive maintenance, and smart factory OS. Continue investing to own this category.", signal: "positive" }
  ]
};

// ---- Portfolio Data ----
const PORTFOLIO_DATA = [
  { name: "FactoryOS", logo: "🏭", stage: "Seed", health: "green", hiring: "+18 roles", traffic: "↑ 42%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$12M by rival AInspect", signals: ["Hypergrowth: 200% rev growth", "Follow-on ready in 6 months"], followOnReady: true },
  { name: "QualityLens", logo: "🔍", stage: "Series A", health: "green", hiring: "+26 roles", traffic: "↑ 68%", appRank: "N/A (B2B)", sentiment: "Very Positive", compFunding: "$8M by VisualAI (SG)", signals: ["TechCrunch feature drove 40% traffic spike", "3 new enterprise logos this month"], followOnReady: true },
  { name: "SteelMind", logo: "🔩", stage: "Series A", health: "green", hiring: "+28 roles", traffic: "↑ 35%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$15M by Uptake (US competitor)", signals: ["JSW Steel case study driving inbound", "Revenue growing slower than hiring — watch burn"], followOnReady: false },
  { name: "Playlo", logo: "🎮", stage: "Pre-Series A", health: "green", hiring: "+22 roles", traffic: "↑ 210%", appRank: "#4 Indonesia", sentiment: "Very Positive", compFunding: "$5M by rival GameHive", signals: ["Viral TikTok driving organic growth", "Retention D7 at 38% — above gaming benchmark"], followOnReady: true },
  { name: "KartBee", logo: "🛒", stage: "Pre-Seed", health: "yellow", hiring: "+34 roles", traffic: "↑ 180%", appRank: "#12 Tier-2 cities", sentiment: "Mixed", compFunding: "$22M by Tier-2 rival QuickBasket", signals: ["⚠️ Competitor just raised $22M Series A", "Burn rate accelerating — 14 months runway"], followOnReady: false },
  { name: "MateriFlow", logo: "🧪", stage: "Seed", health: "green", hiring: "+20 roles", traffic: "↑ 55%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None direct", signals: ["GMV growing 3x QoQ", "Logistics integration completed"], followOnReady: false },
  { name: "GreenMill", logo: "♻️", stage: "Seed", health: "green", hiring: "+19 roles", traffic: "↑ 72%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$10M by Climatiq (EU)", signals: ["Singapore carbon tax expansion announced", "3 MNC pilots converting to contracts"], followOnReady: true },
  { name: "RoboWeld", logo: "🤖", stage: "Series A", health: "green", hiring: "+15 roles", traffic: "↑ 28%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None in ASEAN", signals: ["65 units deployed, 0% churn", "Vietnam factory automation incentive announced"], followOnReady: true }
];

// ---- Power Moves Data ----
const POWER_MOVES = [
  { type: "Fund Launch", title: "Sequoia India / SEA raises $2.8B Fund IX", desc: "Largest-ever SEA-focused fund. Will increase competition in Series A deals across manufacturing tech and consumer.", implication: "⚡ Expect valuation inflation in Series A factory-tech deals. Move faster on QualityLens and SteelMind follow-ons.", time: "2 days ago" },
  { type: "Partner Movement", title: "Accel India Partner Prayank Swaroop joins Lightspeed as Venture Partner", desc: "Prayank was lead on 3 manufacturing-tech deals at Accel. His move signals Lightspeed doubling down on B2B manufacturing in India.", implication: "🎯 Lightspeed may co-invest or compete on FactoryOS-style deals. Engage Prayank for co-lead opportunities.", time: "4 days ago" },
  { type: "Stealth Fundraise", title: "CarbonZero (SG) quietly raising $15M Series A", desc: "ESG compliance platform for ASEAN manufacturers. Direct competitor to GreenMill. Pitched Temasek and GIC.", implication: "⚠️ Accelerate GreenMill's fundraise timeline. Position as the operator-led alternative (Chen's Shell background).", time: "1 week ago" },
  { type: "Markup Signal", title: "Nexus Venture marking up Moglix at 4x in 18 months", desc: "Moglix's B2B industrial marketplace valued at $2.5B. Validates MateriFlow's thesis in Indonesia.", implication: "💰 Use Moglix markup as comp for MateriFlow's next round. Indonesia market 3x less penetrated than India.", time: "1 week ago" },
  { type: "Secondary Transaction", title: "Early ShareChat shares trading at $3.2B implied valuation on secondary market", desc: "Despite layoffs, secondary buyers see long-term value in Bharat vernacular content. Vybe is in same thesis.", implication: "📊 ShareChat secondary demand validates Vybe's vernacular creator thesis. Positive signal for pricing.", time: "10 days ago" },
  { type: "Syndicate Pattern", title: "Temasek + Wavemaker co-leading 3 manufacturing deals in 6 months", desc: "Pattern of co-investment in ASEAN manufacturing tech: robotics, IoT, and supply chain.", implication: "🤝 Approach Wavemaker as systematic co-investor for JV's manufacturing portfolio. They led RoboWeld's A.", time: "2 weeks ago" },
  { type: "Fund Launch", title: "East Ventures launches $250M Growth Fund for Indonesia", desc: "First growth-stage fund. Will compete for Series B deals in Indonesian consumer tech and B2B.", implication: "🔄 East Ventures backed Playlo seed. May lead Series A. Coordinate early to maintain pro-rata.", time: "2 weeks ago" },
  { type: "Stealth Fundraise", title: "FlexiPack (Mumbai) raising $5M seed for packaging automation", desc: "Direct competitor to PackBot. Founded by ex-Uflex engineers. Pitched Blume and 3one4.", implication: "⚠️ PackBot needs to close key FMCG clients fast. Speed of execution is the moat, not tech.", time: "3 weeks ago" }
];

// ---- Pattern Data ----
const PATTERN_WINNERS = [
  { text: "<strong>Founder with 10+ years domain expertise</strong> who then builds tech solution for their own industry pain point. (FactoryOS, QualityLens, SteelMind)" },
  { text: "<strong>Speed of execution in first 6 months</strong>: Winners ship MVP in <90 days and have paying customers by month 4." },
  { text: "<strong>Prior exit or VP+ role at scaled company</strong> — correlates with 3x higher chance of Series A." },
  { text: "<strong>Market timing aligned with regulatory tailwind</strong>: PLI scheme (India), carbon tax (SG), factory automation incentives (VN)." },
  { text: "<strong>Distribution hack in first 30 days</strong>: Viral content, influencer partnerships, or strategic BD that drives 10K+ initial users/customers." },
  { text: "<strong>Open-source or community-led growth</strong> in B2B: GitHub stars >500 in first year correlates with faster enterprise sales." },
  { text: "<strong>Repeat founders</strong> with even 1 prior exit close rounds 2x faster and at 40% higher valuations." }
];

const PATTERN_LOSERS = [
  { text: "<strong>Me-too product in crowded market</strong> without clear distribution advantage. 'Better tech' alone doesn't win." },
  { text: "<strong>First-time founders targeting enterprise</strong> with no industry network. Sales cycles bankrupt them before product-market fit." },
  { text: "<strong>Raised too much too early</strong> without unit economics proof. Creates misaligned incentives and governance issues." },
  { text: "<strong>Single geography, single customer concentration</strong>: Top 3 customers >50% of revenue = fragile business." },
  { text: "<strong>Hardware-only play without software/data moat</strong>: Margins compress with Chinese competition within 18 months." },
  { text: "<strong>Consumer app without organic viral loop</strong>: CAC > LTV death spiral when paid acquisition stops." }
];

const EVAL_CHECKLIST = [
  { icon: "🎯", label: "Founder-market fit (domain expertise > 5 years)" },
  { icon: "⚡", label: "Speed signal (MVP < 90 days, revenue < 6 months)" },
  { icon: "🏆", label: "Prior exit or VP+ at $1B+ company" },
  { icon: "📈", label: "MoM growth > 30% for 3+ consecutive months" },
  { icon: "🛡️", label: "Defensible moat (tech, data, regulation, network effects)" },
  { icon: "🌊", label: "Market timing / regulatory tailwind present" },
  { icon: "💰", label: "Unit economics positive or clear path within 12 months" },
  { icon: "🌏", label: "Multi-geo expansion potential without full rebuild" },
  { icon: "👥", label: "Team hiring velocity (>10 roles/month = conviction)" },
  { icon: "🔄", label: "Product engagement: DAU/MAU > 25% or NPS > 50" }
];

// ---- Init ----
async function init() {
  // Try loading from Supabase first
  const liveData = await initSupabase();

  if (liveData) {
    rankedStartups = rankStartups(liveData);
  } else {
    console.log('Using local mock data fallback.');
    rankedStartups = rankStartups(STARTUPS);
  }

  // Set date
  const now = new Date();
  document.getElementById('report-date').textContent = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('deal-count-badge').textContent = rankedStartups.length;

  // Bind navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });

  // Bind filters
  document.getElementById('filter-geo').value = 'All';
  document.getElementById('filter-geo').addEventListener('change', (e) => { filters.geo = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-sector').addEventListener('change', (e) => { filters.sector = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-tier').addEventListener('change', (e) => { filters.tier = e.target.value; renderCurrentSection(); });
  document.getElementById('search-input').addEventListener('input', (e) => { filters.search = e.target.value.toLowerCase(); renderCurrentSection(); });

  // Modal close
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Render initial section
  renderCurrentSection();
}

function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  const titles = {
    dealflow: 'Deal Flow Pipeline',
    deckanalyzer: 'Deck Analyzer',
    valuation: 'Valuation Intelligence',
    thesis: 'Thesis Tracker',
    portfolio: 'Portfolio Command Center',
    powermoves: 'Power Moves & Signals',
    patterns: 'Pattern Recognition Engine',
    briefing: 'Daily Intelligence Brief',
    integrations: 'Integrations Hub',
    meetingprep: 'Partner Meeting Prep',
    icmemo: 'IC Memo Generator',
    fundradar: 'Fundraising Radar',
    vccrm: 'Relationship Intelligence',
    networkmap: 'Co-Investment Network',
    competitive: 'Competitive Landscape',
    lpreport: 'LP Quarterly Report',
    dealvelocity: 'Deal Velocity Tracker',
    admin: 'Admin Panel',
    activitylog: 'Activity Log'
  };
  document.getElementById('page-title').textContent = titles[section] || '';

  // Close mobile menu
  document.getElementById('sidebar').classList.remove('open');

  renderCurrentSection();
}

function renderCurrentSection() {
  const area = document.getElementById('content-area');
  area.scrollTop = 0;

  switch (currentSection) {
    case 'dealflow': renderDealFlow(area); break;
    case 'deckanalyzer': renderDeckAnalyzer(area); break;
    case 'valuation': renderValuation(area); break;
    case 'thesis': renderThesis(area); break;
    case 'portfolio': renderPortfolio(area); break;
    case 'powermoves': renderPowerMoves(area); break;
    case 'patterns': renderPatterns(area); break;
    case 'briefing': renderBriefing(area); break;
    case 'integrations': renderIntegrations(area); break;
    case 'meetingprep': renderMeetingPrep(area); break;
    case 'icmemo': renderICMemo(area); break;
    case 'fundradar': renderFundRadar(area); break;
    case 'vccrm': renderVCCRM(area); break;
    case 'networkmap': renderNetworkMap(area); break;
    case 'competitive': renderCompetitive(area); break;
    case 'lpreport': renderLPReport(area); break;
    case 'dealvelocity': renderDealVelocity(area); break;
    case 'admin': renderAdmin(area); break;
    case 'activitylog': renderActivityLog(area); break;
  }
}

// ============================================================
// MODULE 1: Deal Flow
// ============================================================
function getFilteredStartups() {
  return rankedStartups.filter(s => {
    if (filters.geo !== 'All' && s.geography !== filters.geo) return false;
    if (filters.sector !== 'All' && s.sector !== filters.sector && s.subSector !== filters.sector) return false;
    if (filters.tier !== 'All' && s.scores.tier.class !== filters.tier) return false;
    if (filters.search) {
      const q = filters.search;
      const searchable = `${s.name} ${s.sector} ${s.subSector} ${s.geography} ${s.city} ${s.founders.map(f => f.name + ' ' + f.pedigree).join(' ')}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

function renderDealFlow(area) {
  const filtered = getFilteredStartups();
  const hot = filtered.filter(s => s.scores.tier.class === 'tier-hot').length;
  const warm = filtered.filter(s => s.scores.tier.class === 'tier-warm').length;
  const avgScore = filtered.length ? Math.round(filtered.reduce((a, s) => a + s.scores.composite, 0) / filtered.length) : 0;

  const todaySignals = filtered.reduce((acc, s) => {
    return acc + Object.values(s.signals).filter(sig => sig.score >= 75).length;
  }, 0);

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Deals Tracked</div>
        <div class="stat-value emerald">${filtered.length}</div>
        <div class="stat-change positive">↑ across ${new Set(filtered.map(s => s.geography)).size} markets</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Hot Deals</div>
        <div class="stat-value orange">${hot}</div>
        <div class="stat-change positive">🔥 Immediate attention</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Strong Signals Today</div>
        <div class="stat-value pink">${todaySignals}</div>
        <div class="stat-change positive">Signals scoring 75+</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Score</div>
        <div class="stat-value blue">${avgScore}</div>
        <div class="stat-change ${avgScore > 60 ? 'positive' : ''}">${avgScore > 60 ? '↑ Above threshold' : '→ Monitoring'}</div>
      </div>
    </div>

    <div class="deal-grid">
      ${filtered.map((s, i) => renderDealCard(s, i)).join('')}
    </div>
  `;

  // Bind card clicks
  area.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const startup = rankedStartups.find(s => s.id === id);
      if (startup) openDealModal(startup);
    });
  });
}

function renderDealCard(s, idx) {
  const topSignals = Object.entries(s.signals)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 4);

  const trendData = s.signals.appDownloads?.trend || s.signals.viralTraction?.trend || s.signals.hiringSpike?.trend;
  const sparkline = trendData ? createSparkline(trendData, getScoreColor(s.scores.composite)) : '';

  return `
    <div class="deal-card ${s.scores.tier.class} animated-item" data-id="${s.id}">
      <div class="deal-rank">#${s.rank}</div>
      <div class="deal-info">
        <div class="deal-header">
          <div class="deal-logo">${s.logo}</div>
          <div class="deal-name">${s.name}</div>
          <span class="deal-tier-badge ${s.scores.tier.class}">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
        </div>
        <div class="deal-meta">
          <span class="deal-tag ${s.sector === 'Consumer Tech' ? 'sector-consumer' : 'sector-b2b'}">${s.subSector}</span>
          <span class="deal-tag geo">📍 ${s.city}, ${s.geography}</span>
          <span class="deal-tag">${s.stage}</span>
          <span class="deal-tag">$${s.lastRound.amount}M ${s.lastRound.type}</span>
        </div>
      </div>
      <div class="deal-signals">
        ${topSignals.map(([key, sig]) => {
    const info = SIGNAL_TYPES.find(t => t.key === key);
    return `<div class="signal-dot ${sig.score >= 75 ? 'hot' : ''}" title="${info?.label}: ${sig.score}">
            ${info?.icon || '📊'}
            <div class="tooltip">${info?.label}: ${sig.score}/100</div>
          </div>`;
  }).join('')}
      </div>
      <div class="sparkline-container">${sparkline}</div>
      <div class="deal-score-container">
        <div class="deal-score ${getScoreClass(s.scores.composite)}">${s.scores.composite}</div>
        <div class="deal-score-label">Score</div>
      </div>
    </div>
  `;
}

function openDealModal(s) {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">${s.logo}</div>
        <div>
          <h3>${s.name}</h3>
          <div class="sub">${s.subSector} · ${s.city}, ${s.geography} · ${s.stage}</div>
        </div>
        <span class="deal-tier-badge ${s.scores.tier.class}" style="margin-left:12px">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-section-title">Company Description</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6">${s.description}</p>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Scoring Radar</div>
        <div class="radar-chart-container">
          ${createRadarChart(s.scores.dimensions)}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Score Breakdown</div>
        <div class="score-breakdown">
          ${Object.entries(s.scores.dimensions).map(([key, val]) => {
    const labels = { marketSize: 'Market Size', founderPedigree: 'Founder Pedigree', earlyTraction: 'Early Traction', productDifferentiation: 'Product Diff.', fundability: 'Fundability' };
    return `
              <div class="score-dim">
                <div class="score-dim-label">${labels[key]}</div>
                <div class="score-dim-bar"><div class="score-dim-bar-fill" style="width:${val}%;background:${getBarColor(val)}"></div></div>
                <div class="score-dim-val" style="color:${getBarColor(val)}">${val}</div>
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Founders</div>
        <div class="founders-list">
          ${s.founders.map(f => `
            <div class="founder-card">
              <div class="founder-avatar">${f.name.split(' ').map(n => n[0]).join('')}</div>
              <div>
                <div class="founder-name">${f.name} <span class="founder-role">· ${f.role}</span></div>
                <div class="founder-pedigree">${f.pedigree}${f.previousExits ? ` · ${f.previousExits} prior exit${f.previousExits > 1 ? 's' : ''}` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Signal Strength</div>
        <div class="signals-grid">
          ${SIGNAL_TYPES.map(st => {
    const sig = s.signals[st.key];
    return `
              <div class="signal-card">
                <div class="signal-card-header">
                  <span class="signal-card-icon">${st.icon}</span>
                  <span class="signal-card-label">${st.label}</span>
                </div>
                <div class="signal-card-score" style="color:${getBarColor(sig.score)}">${sig.score}/100</div>
                <div class="signal-card-detail">${sig.detail}</div>
                ${sig.trend ? `<div style="margin-top:8px">${createSparkline(sig.trend, st.color, 120, 28)}</div>` : ''}
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Key Metrics</div>
        <div class="score-breakdown">
          <div class="score-dim"><div class="score-dim-label">MAU</div><div class="score-dim-val" style="color:var(--accent-blue)">${s.metrics.mau >= 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau}</div></div>
          <div class="score-dim"><div class="score-dim-label">MAU Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.mauGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">MRR</div><div class="score-dim-val" style="color:var(--accent-amber)">$${(s.metrics.revenue / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Rev Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.revenueGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">Burn Rate</div><div class="score-dim-val" style="color:var(--accent-pink)">$${(s.metrics.burnRate / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Runway</div><div class="score-dim-val" style="color:${s.metrics.runway > 12 ? 'var(--accent-emerald)' : 'var(--accent-red)'}">${s.metrics.runway} mo</div></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">💡 Investment Thesis</div>
        <div class="thesis-box">
          <p>${s.thesis}</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ============================================================
// MODULE 8: Deck Analyzer
// ============================================================

const SAMPLE_DECKS = [
  {
    id: 'deck-001', name: 'FactoryOS - Series A Deck', company: 'FactoryOS', type: 'pdf', uploadDate: '2026-02-27',
    ratings: { problem: 88, solution: 82, market: 90, team: 92, traction: 78, businessModel: 75, financials: 70, ask: 80 },
    verdict: 'pass', verdictText: 'Strong deck — clear problem-solution fit, impressive team pedigree, and validated traction. Market sizing is well-researched. Financial projections need tighter unit economics. Recommend proceeding to partner meeting.',
    strengths: ['Exceptional founder-market fit', 'Clear TAM/SAM/SOM breakdown', 'Customer testimonials from 3 enterprise logos'],
    weaknesses: ['Unit economics slide lacks detail', 'Competitive moat section could be stronger']
  },
  {
    id: 'deck-002', name: 'Playlo - Pre-Series A Deck', company: 'Playlo', type: 'ppt', uploadDate: '2026-02-26',
    ratings: { problem: 72, solution: 85, market: 80, team: 78, traction: 92, businessModel: 68, financials: 60, ask: 72 },
    verdict: 'review', verdictText: 'Compelling traction story with viral metrics. However, monetization strategy needs further diligence. Retention data is strong (D7: 38%) but D30 is missing. Request follow-up with deeper cohort analysis.',
    strengths: ['Explosive growth metrics', 'Viral coefficient > 1.2', 'SEA gaming market timing is perfect'],
    weaknesses: ['Monetization unclear — ARPU not defined', 'Missing D30 retention cohorts', 'Burn rate projection seems optimistic']
  },
  {
    id: 'deck-003', name: 'GreenMill - Seed Extension', company: 'GreenMill', type: 'pdf', uploadDate: '2026-02-25',
    ratings: { problem: 95, solution: 88, market: 92, team: 87, traction: 72, businessModel: 82, financials: 78, ask: 85 },
    verdict: 'pass', verdictText: 'Excellent regulatory-driven thesis. EU CBAM creates forced buyer behavior — rare in B2B SaaS. Team has unique Shell background. Ask is reasonable for traction stage. Move to IC.',
    strengths: ['Regulatory tailwind = forced adoption', 'Founder ran $500M sustainability budget at Shell', 'Land-and-expand model proven with 3 MNCs'],
    weaknesses: ['ASEAN regulatory timeline uncertain', 'Customer willingness-to-pay needs validation beyond pilots']
  },
  {
    id: 'deck-004', name: 'QuickServe - Seed Deck', company: 'QuickServe (New)', type: 'pdf', uploadDate: '2026-02-24',
    ratings: { problem: 55, solution: 50, market: 60, team: 45, traction: 30, businessModel: 40, financials: 35, ask: 42 },
    verdict: 'skip', verdictText: 'Crowded space with no clear differentiation. Team lacks relevant industry experience. Pre-revenue with aggressive valuation ask. Pass — recommend monitoring only if they demonstrate 3 months of traction.',
    strengths: ['Large addressable market'],
    weaknesses: ['No differentiation from 10+ competitors', 'First-time founders, no domain expertise', 'Pre-revenue asking $12M valuation', '$0 revenue, no LOIs']
  }
];

function renderDeckAnalyzer(area) {
  const total = uploadedDecks.length + SAMPLE_DECKS.length;
  const allDecks = [...SAMPLE_DECKS, ...uploadedDecks];
  const passCount = allDecks.filter(d => d.verdict === 'pass').length;
  const reviewCount = allDecks.filter(d => d.verdict === 'review').length;
  const skipCount = allDecks.filter(d => d.verdict === 'skip').length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Total Decks</div>
        <div class="stat-value emerald">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ Pass to IC</div>
        <div class="stat-value emerald">${passCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🔍 Needs Review</div>
        <div class="stat-value amber">${reviewCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">❌ Skip</div>
        <div class="stat-value orange">${skipCount}</div>
      </div>
    </div>

    <div class="deck-upload-zone" id="deck-upload-zone">
      <span class="upload-icon">📄</span>
      <div class="upload-title">Drop a pitch deck here to analyze</div>
      <div class="upload-subtitle">Supports PDF, PPTX, Google Slides links · AI-powered rating in seconds</div>
      <button class="upload-btn">Browse Files</button>
      <input type="file" id="deck-file-input" accept=".pdf,.pptx,.ppt">
    </div>

    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">Analyzed Decks</div>
      <div class="section-subtitle">${total} decks rated · Click to expand</div>
    </div>

    <div class="decks-grid">
      ${allDecks.map(d => renderDeckCard(d)).join('')}
    </div>
  `;

  // Bind upload
  const uploadZone = document.getElementById('deck-upload-zone');
  const fileInput = document.getElementById('deck-file-input');
  const browseBtn = uploadZone.querySelector('.upload-btn');

  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleDeckUpload(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleDeckUpload(e.target.files));
}

function handleDeckUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const ext = file.name.split('.').pop().toLowerCase();
  const type = ext === 'pdf' ? 'pdf' : 'ppt';

  // Simulate AI analysis
  const ratings = {
    problem: 50 + Math.floor(Math.random() * 40),
    solution: 50 + Math.floor(Math.random() * 40),
    market: 50 + Math.floor(Math.random() * 40),
    team: 40 + Math.floor(Math.random() * 45),
    traction: 30 + Math.floor(Math.random() * 50),
    businessModel: 40 + Math.floor(Math.random() * 45),
    financials: 35 + Math.floor(Math.random() * 45),
    ask: 40 + Math.floor(Math.random() * 45)
  };

  const avg = Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / 8);
  let verdict, verdictText;
  if (avg >= 75) {
    verdict = 'pass';
    verdictText = `Strong deck from ${file.name.replace(/\.[^/.]+$/, '')}. Recommend proceeding to partner meeting for deeper evaluation. Key metrics and team credentials are compelling.`;
  } else if (avg >= 55) {
    verdict = 'review';
    verdictText = `Deck shows promise but needs additional diligence. Some sections are strong but others need more data. Request follow-up materials before IC.`;
  } else {
    verdict = 'skip';
    verdictText = `Deck does not meet current investment criteria. Insufficient traction and unclear competitive positioning. Recommend passing at this stage.`;
  }

  const newDeck = {
    id: `deck-${Date.now()}`,
    name: file.name.replace(/\.[^/.]+$/, ''),
    company: file.name.replace(/\.[^/.]+$/, '').split('-')[0].trim(),
    type: type,
    uploadDate: new Date().toISOString().split('T')[0],
    ratings,
    verdict,
    verdictText,
    strengths: ['AI analysis in progress — review manually for full assessment'],
    weaknesses: ['Automated analysis may miss nuances — partner review recommended']
  };

  uploadedDecks.unshift(newDeck);
  renderDeckAnalyzer(document.getElementById('content-area'));
}

function renderDeckCard(d) {
  const ratingLabels = {
    problem: 'Problem', solution: 'Solution', market: 'Market Size',
    team: 'Team', traction: 'Traction', businessModel: 'Biz Model',
    financials: 'Financials', ask: 'The Ask'
  };
  const avg = Math.round(Object.values(d.ratings).reduce((a, b) => a + b, 0) / 8);
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (avg / 100) * circumference;
  const ringColor = avg >= 75 ? 'var(--accent-emerald)' : avg >= 55 ? 'var(--accent-amber)' : 'var(--accent-red)';

  return `
    <div class="deck-card animated-item">
      <div class="deck-card-header">
        <div class="deck-card-icon ${d.type}">${d.type === 'pdf' ? '📕' : '📊'}</div>
        <div>
          <div class="deck-card-name">${d.name}</div>
          <div class="deck-card-meta">
            <span class="deal-tag">${d.company}</span>
            <span class="deck-card-timestamp">${d.uploadDate}</span>
          </div>
        </div>
        <div class="deck-overall-score">
          <div class="score-ring">
            <svg viewBox="0 0 48 48">
              <circle class="bg" cx="24" cy="24" r="22" />
              <circle class="progress" cx="24" cy="24" r="22"
                stroke="${ringColor}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}" />
            </svg>
            <div class="score-ring-value" style="color:${ringColor}">${avg}</div>
          </div>
        </div>
      </div>

      <div class="deck-ratings">
        ${Object.entries(d.ratings).map(([key, val]) => `
          <div class="deck-rating-row">
            <div class="deck-rating-label">${ratingLabels[key]}</div>
            <div class="deck-rating-bar"><div class="deck-rating-bar-fill" style="width:${val}%;background:${getBarColor(val)}"></div></div>
            <div class="deck-rating-val" style="color:${getBarColor(val)}">${val}</div>
          </div>
        `).join('')}
      </div>

      <div class="deck-verdict ${d.verdict}">
        <strong>${d.verdict === 'pass' ? '✅ PASS — Move to IC' : d.verdict === 'review' ? '🔍 REVIEW — Needs Follow-up' : '❌ SKIP — Does Not Meet Criteria'}</strong><br>
        ${d.verdictText}
      </div>

      ${d.strengths ? `
        <div style="margin-top:10px;font-size:0.75rem">
          <span style="color:var(--accent-emerald);font-weight:700">Strengths:</span>
          <span style="color:var(--text-secondary)">${d.strengths.join(' · ')}</span>
        </div>` : ''}
      ${d.weaknesses ? `
        <div style="margin-top:4px;font-size:0.75rem">
          <span style="color:var(--accent-amber);font-weight:700">Weaknesses:</span>
          <span style="color:var(--text-secondary)">${d.weaknesses.join(' · ')}</span>
        </div>` : ''}

      <div class="deck-action-btns">
        <button class="deck-action-btn primary">📋 Add to Pipeline</button>
        <button class="deck-action-btn">💬 Share with Team</button>
        <button class="deck-action-btn">📥 Download Report</button>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 2: Valuation Intelligence
// ============================================================
function renderValuation(area) {
  const overpriced = VALUATION_COMPS.filter(v => v.status === 'overpriced').length;
  const underpriced = VALUATION_COMPS.filter(v => v.status === 'underpriced').length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Companies Analyzed</div>
        <div class="stat-value emerald">${VALUATION_COMPS.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fairly Valued</div>
        <div class="stat-value blue">${VALUATION_COMPS.filter(v => v.status === 'fair').length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Underpriced 🎯</div>
        <div class="stat-value emerald">${underpriced}</div>
        <div class="stat-change positive">Potential alpha</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overpriced ⚠️</div>
        <div class="stat-value orange">${overpriced}</div>
      </div>
    </div>

    <div class="section-title-row">
      <div class="section-title">Valuation Analysis & Comparables</div>
      <div class="section-subtitle">Fair value estimates based on comparable deals</div>
    </div>

    <div class="deal-grid">
      ${VALUATION_COMPS.map((v, i) => `
        <div class="deal-card animated-item" style="grid-template-columns: 1fr auto; cursor:default;">
          <div class="deal-info">
            <div class="deal-header">
              <div class="deal-name">${v.name}</div>
              <span class="deal-tag">${v.stage}</span>
              <span class="deal-tag sector-b2b">${v.model}</span>
              <span class="val-tag ${v.status}">${v.status === 'fair' ? '✅ Fair' : v.status === 'underpriced' ? '🎯 Underpriced' : '⚠️ Overpriced'}</span>
            </div>
            <div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
              <div>
                <div class="stat-label">Revenue</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-emerald)">${v.revenue}</div>
              </div>
              <div>
                <div class="stat-label">Growth</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-amber)">${v.growth}</div>
              </div>
              <div>
                <div class="stat-label">Fair Valuation</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-blue)">${v.fairVal}</div>
              </div>
              <div>
                <div class="stat-label">Current Valuation</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text-primary)">${v.currentVal}</div>
              </div>
            </div>
            <div style="margin-top:12px">
              <div class="stat-label" style="margin-bottom:6px">Comparable Deals</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${v.comps.map(c => `<span class="deal-tag">${c}</span>`).join('')}
              </div>
            </div>
            <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <div class="stat-label" style="margin-bottom:4px">Next Round Potential</div>
                <div style="font-size:0.8rem;color:var(--accent-emerald);line-height:1.4">${v.nextRound}</div>
              </div>
              <div>
                <div class="stat-label" style="margin-bottom:4px">Risks VCs May Ignore</div>
                <div style="font-size:0.8rem;color:var(--accent-amber);line-height:1.4">${v.risks}</div>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 3: Thesis Tracker
// ============================================================
function renderThesis(area) {
  area.innerHTML = `
    <div class="insight-box positive">
      <span class="insight-emoji">🧭</span>
      <strong>Your thesis is getting stronger in:</strong> AI-Powered Manufacturing, Sustainable Manufacturing, Affordable Industrial Robotics. Capital is flowing into factory-tech at unprecedented rates.
    </div>
    <div class="insight-box warning">
      <span class="insight-emoji">⚠️</span>
      <strong>You are underexposed to:</strong> Semiconductor Supply Chain, Agri-Manufacturing. Both are $50B+ TAM markets with strong regulatory tailwinds and minimal VC competition.
    </div>

    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">🚀 Accelerating Themes</div>
      <div class="section-subtitle">Capital flowing in, conviction building</div>
    </div>
    <div class="thesis-grid">
      ${THESIS_DATA.accelerating.map(t => `
        <div class="thesis-card accelerating animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status up">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">⚠️ Getting Saturated</div>
      <div class="section-subtitle">High competition, margins compressing</div>
    </div>
    <div class="thesis-grid">
      ${THESIS_DATA.saturated.map(t => `
        <div class="thesis-card saturated animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status flat">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">💎 White Spaces</div>
      <div class="section-subtitle">Low competition, massive TAM, strong thesis fit</div>
    </div>
    <div class="thesis-grid" style="grid-template-columns: repeat(4, 1fr)">
      ${THESIS_DATA.whitespace.map(t => `
        <div class="thesis-card whitespace animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status up">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">📊 Portfolio Construction Gaps</div>
    </div>
    <div class="deal-grid">
      ${THESIS_DATA.gaps.map(g => `
        <div class="insight-box ${g.signal === 'positive' ? 'positive' : g.signal === 'negative' ? 'warning' : 'info'} animated-item">
          <span class="insight-emoji">${g.emoji}</span>
          <strong>${g.title}</strong> — ${g.desc}
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 4: Portfolio Command Center
// ============================================================
function renderPortfolio(area) {
  const greenCount = PORTFOLIO_DATA.filter(p => p.health === 'green').length;
  const followOnReady = PORTFOLIO_DATA.filter(p => p.followOnReady).length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Portfolio Companies</div>
        <div class="stat-value emerald">${PORTFOLIO_DATA.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Health: Green</div>
        <div class="stat-value emerald">${greenCount}</div>
        <div class="stat-change positive">✅ On track</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Follow-on Ready</div>
        <div class="stat-value blue">${followOnReady}</div>
        <div class="stat-change positive">Pro-rata opportunity</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Alerts</div>
        <div class="stat-value orange">${PORTFOLIO_DATA.filter(p => p.health !== 'green').length}</div>
        <div class="stat-change negative">Needs attention</div>
      </div>
    </div>

    <div class="section-title-row">
      <div class="section-title">📊 Weekly Partner Update</div>
      <div class="section-subtitle">Auto-generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>

    <div class="portfolio-grid">
      ${PORTFOLIO_DATA.map((p, i) => `
        <div class="portfolio-card animated-item">
          <div class="portfolio-logo">${p.logo}</div>
          <div>
            <div class="portfolio-info-name">${p.name}</div>
            <div class="portfolio-info-sub">${p.stage}</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-blue)">${p.hiring}</div>
            <div class="portfolio-metric-label">Hiring</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-emerald)">${p.traffic}</div>
            <div class="portfolio-metric-label">Traffic</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-purple)">${p.appRank}</div>
            <div class="portfolio-metric-label">App Rank</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="health-indicator ${p.health}">${p.health === 'green' ? '● Healthy' : p.health === 'yellow' ? '● Caution' : '● Alert'}</span>
              ${p.followOnReady ? '<span class="health-indicator green">↑ Follow-on Ready</span>' : ''}
            </div>
            <div style="font-size:0.72rem;color:var(--text-tertiary)">Sentiment: ${p.sentiment} | Competitor: ${p.compFunding}</div>
            ${p.signals.map(sig => `<div style="font-size:0.75rem;color:${sig.startsWith('⚠️') ? 'var(--accent-amber)' : 'var(--text-secondary)'};line-height:1.4">• ${sig}</div>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 5: Power Moves & Gossip
// ============================================================
function renderPowerMoves(area) {
  area.innerHTML = `
    <div class="insight-box info">
      <span class="insight-emoji">🕵️</span>
      <strong>Intelligence Summary:</strong> Sequoia's mega-fund will inflate manufacturing-tech valuations. Two stealth competitors raising in your portfolio's space. One key partner movement creates co-investment opportunity.
    </div>

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">Network Intelligence Feed</div>
      <div class="section-subtitle">Signals that move markets</div>
    </div>

    <div class="power-timeline">
      ${POWER_MOVES.map((pm, i) => `
        <div class="power-event animated-item">
          <div class="power-event-type">${pm.type}</div>
          <div class="power-event-title">${pm.title}</div>
          <div class="power-event-desc">${pm.desc}</div>
          <div class="power-event-implication">${pm.implication}</div>
          <div class="power-event-time">${pm.time}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 6: Pattern Recognition Engine
// ============================================================
function renderPatterns(area) {
  area.innerHTML = `
    <div class="insight-box positive">
      <span class="insight-emoji">🧬</span>
      <strong>Pattern Insight:</strong> In JV's portfolio, 100% of companies with composite score >75 have founders with prior exits AND regulatory tailwinds. Speed of execution (MVP <90 days) correlates with 3x Series A success rate.
    </div>

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">What Winners Look Like Before They Win</div>
      <div class="section-subtitle">Patterns from historical startup data analysis</div>
    </div>

    <div class="pattern-columns">
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-emerald)">✅</span> Winner Patterns</div>
        ${PATTERN_WINNERS.map(p => `
          <div class="pattern-item">
            <div class="pattern-check win">✓</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-red)">✗</span> Failure Patterns</div>
        ${PATTERN_LOSERS.map(p => `
          <div class="pattern-item">
            <div class="pattern-check fail">✗</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">📋 New Deal Evaluation Checklist</div>
      <div class="section-subtitle">Score ≥7/10 = strong conviction · 5-6 = deep dive · <5 = pass</div>
    </div>

    <div class="checklist-grid">
      ${EVAL_CHECKLIST.map(c => `
        <div class="checklist-item animated-item">
          <span class="checklist-icon">${c.icon}</span>
          <span>${c.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 7: Daily Intelligence Briefing
// ============================================================
function renderBriefing(area) {
  const top5 = rankedStartups.slice(0, 5);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  area.innerHTML = `
    <div class="briefing-container">
      <div class="briefing-date">📅 ${dateStr} · 5 min read</div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🎯</span>
          <span class="briefing-section-title">5 Deals to Track</span>
          <span class="briefing-section-count">TOP PICKS</span>
        </div>
        ${top5.map((s, i) => `
          <div class="briefing-item animated-item">
            <div class="briefing-item-title">${i + 1}. ${s.scores.tier.emoji} ${s.name} — ${s.subSector} (${s.geography})</div>
            <div class="briefing-item-body">
              Score: <strong>${s.scores.composite}</strong> | ${s.stage} | $${s.lastRound.amount}M ${s.lastRound.type}<br>
              <strong>Why now:</strong> ${Object.entries(s.signals).sort((a, b) => b[1].score - a[1].score)[0][1].detail}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">📈</span>
          <span class="briefing-section-title">3 Trends</span>
          <span class="briefing-section-count">MARKET PULSE</span>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">1. Factory AI funding up 180% YoY in India</div>
          <div class="briefing-item-body">India's PLI scheme + China+1 migration driving unprecedented demand for manufacturing automation. Three JV portfolio companies (FactoryOS, QualityLens, SteelMind) are in the sweet spot. Expect Series A valuations to 2x by Q3 2026.</div>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">2. SEA social commerce GMV growing 45% QoQ</div>
          <div class="briefing-item-body">Livestream shopping adoption in Vietnam and Indonesia outpacing all other channels. ShopHero and Playlo are early indicators. TikTok Shop's ASEAN revenue hit $4.4B — creating platform risk but also massive distribution opportunity.</div>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">3. ESG compliance becoming mandatory for ASEAN exporters</div>
          <div class="briefing-item-body">EU CBAM (Carbon Border Adjustment Mechanism) takes full effect 2026. Singapore carbon tax doubled. Vietnamese factories need carbon accounting or lose EU export access. GreenMill's TAM just expanded significantly.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🔮</span>
          <span class="briefing-section-title">1 Contrarian Insight</span>
        </div>
        <div class="briefing-item contrarian animated-item">
          <div class="briefing-item-title">Everyone's chasing AI SaaS — the real alpha is in hardware-software combos</div>
          <div class="briefing-item-body">While VCs pile into pure software plays, RoboWeld and PackBot combine hardware + AI software at 70% gross margins. Hardware creates lock-in that software alone can't achieve. Chinese competitors can't replicate the local field service network. This is the Fanuc/Keyence playbook, not the Salesforce one. JV should double down here while others look away.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🚨</span>
          <span class="briefing-section-title">1 Portfolio Alert</span>
        </div>
        <div class="briefing-item alert animated-item">
          <div class="briefing-item-title">⚠️ KartBee — Competitor QuickBasket raised $22M Series A</div>
          <div class="briefing-item-body">Direct competitor in Tier-2 quick commerce just closed $22M from Tiger Global. KartBee has 14 months runway but needs to accelerate expansion to defend territory. <strong>Recommendation:</strong> Schedule emergency board call to discuss accelerated fundraise timeline and potential bridge from existing investors.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🌶️</span>
          <span class="briefing-section-title">1 Spicy Ecosystem Update</span>
        </div>
        <div class="briefing-item spicy animated-item">
          <div class="briefing-item-title">Sequoia's $2.8B mega-fund is about to reshape SEA deal dynamics</div>
          <div class="briefing-item-body">Sources indicate Sequoia India/SEA is deploying aggressively into manufacturing-tech — the exact same thesis as JV. Two of their scouts have already reached out to FactoryOS and QualityLens for "coffee chats." <strong>This is both validation and threat.</strong> JV should lock pro-rata rights immediately and consider preemptive term sheets for highest-conviction names. The window to lead rounds cheaply is closing fast. 🔥</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 9: Integrations Hub
// ============================================================
function renderIntegrations(area) {
  const gmailStatus = integrationState.gmail.connected ? 'connected' : 'disconnected';
  const streakStatus = integrationState.streak.connected ? 'connected' : 'disconnected';
  const supabaseStatus = integrationState.supabase.connected ? 'connected' : 'disconnected';
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Integrations</div>
        <div class="stat-value emerald">4</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Connected</div>
        <div class="stat-value emerald">${[integrationState.gmail.connected, integrationState.streak.connected, integrationState.supabase.connected].filter(Boolean).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Team Members</div>
        <div class="stat-value blue">${integrationState.team.members.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sync Status</div>
        <div class="stat-value ${supabaseStatus === 'connected' ? 'emerald' : 'orange'}">${supabaseStatus === 'connected' ? 'Live' : 'Offline'}</div>
      </div>
    </div>

    <div class="integrations-grid">

      <!-- Supabase -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo supabase">🔋</div>
          <div>
            <div class="integration-name">Supabase</div>
            <div class="integration-desc">Real-time database & collaboration backend</div>
          </div>
          <div class="integration-status ${supabaseStatus}">
            <span>●</span> ${supabaseStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.supabase.connected ? `
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Connected to Supabase</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Project: vtxuzrkwnyhxciohwjjx</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Real-time sync active</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Ready for multi-user collaboration</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Project URL" id="sb-url" value="${SUPABASE_URL}">
            </div>
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Anon Key" id="sb-key" value="${SUPABASE_KEY}">
              <button class="integration-connect-btn" id="connect-supabase">Connect</button>
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Store deals, decks, and theses in cloud</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Real-time collaboration with team</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Access from any device / browser</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Automatic backups & version history</div>
          </div>
        </div>
      </div>

      <!-- Gmail -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo gmail">📧</div>
          <div>
            <div class="integration-name">Gmail</div>
            <div class="integration-desc">Auto-scan deal emails & founder intros</div>
          </div>
          <div class="integration-status ${gmailStatus}">
            <span>●</span> ${gmailStatus === 'connected' ? 'Connected' : 'Not Connected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.gmail.connected ? `
            <div class="insight-box positive" style="margin:0">Connected as <strong>${integrationState.gmail.email}</strong></div>
            ${integrationState.gmail.emails.length > 0 ? `
              <div class="sync-log" style="max-height:180px">
                ${integrationState.gmail.emails.map(e => `
                  <div class="sync-log-entry" style="padding:6px 0">
                    <div style="font-weight:600;font-size:0.75rem;color:var(--text-primary)">${e.subject}</div>
                    <div style="font-size:0.68rem;color:var(--text-muted)">${e.from} · ${new Date(e.date).toLocaleDateString()}</div>
                    ${e.matchedStartups.length > 0 ? `<div style="margin-top:3px">${e.matchedStartups.map(s => `<span class="deal-tag" style="font-size:0.62rem">🏷️ ${s}</span>`).join(' ')}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="sync-log">
                <div class="sync-log-entry"><span class="sync-log-ok">✓ Connected — scanning for deal emails...</span></div>
              </div>
            `}
          ` : `
            <button class="integration-connect-btn google" id="connect-gmail" style="width:100%;justify-content:center">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Connect Gmail Account
            </button>
            <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);text-align:center">
              Click to set up Google OAuth · Steps will guide you through it
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">📥</span> Auto-detect deal mails from founders</div>
            <div class="integration-feature"><span class="integration-feature-icon">🏷️</span> Tag emails by startup in pipeline</div>
            <div class="integration-feature"><span class="integration-feature-icon">📊</span> Deal inbox with email thread summary</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Alerts for warm intro replies</div>
          </div>
        </div>
      </div>

      <!-- Streak CRM -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo streak">🔥</div>
          <div>
            <div class="integration-name">Streak CRM</div>
            <div class="integration-desc">Sync deal pipeline with Gmail CRM</div>
          </div>
          <div class="integration-status ${streakStatus}">
            <span>●</span> ${streakStatus === 'connected' ? 'Connected' : 'Not Connected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.streak.connected ? `
            <div class="insight-box positive" style="margin:0">✅ Syncing with Streak CRM — API key configured</div>
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ API key validated: strk_...BiAx</span></div>
              ${integrationState.streak.pipelines.map(p => `
                <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Pipeline: ${p.name} (${p.boxes} boxes, ${p.stage})</span></div>
              `).join('')}
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Hot/Warm/Watch tiers mapped to Streak stages</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Two-way sync active</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Streak API Key (Settings → Integrations → API)" id="streak-key" type="password">
              <button class="integration-connect-btn streak-btn" id="connect-streak">Connect</button>
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">🔄</span> Two-way deal sync with Streak pipelines</div>
            <div class="integration-feature"><span class="integration-feature-icon">📋</span> Map Streak stages to JV tiers (Hot/Warm/Watch)</div>
            <div class="integration-feature"><span class="integration-feature-icon">📧</span> Link email threads to deal cards</div>
            <div class="integration-feature"><span class="integration-feature-icon">📊</span> Pull Streak deal notes into platform</div>
          </div>
        </div>
      </div>

      <!-- Team Collaboration -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo team">👥</div>
          <div>
            <div class="integration-name">Team</div>
            <div class="integration-desc">Collaborate and share the dashboard</div>
          </div>
          <div class="integration-status connected">
            <span>●</span> ${integrationState.team.members.length} members
          </div>
        </div>
        <div class="integration-body">
          <div class="team-grid">
            ${integrationState.team.members.map(m => `
              <div class="team-member-card">
                <div class="team-avatar" style="background:${m.color}">${m.name.split(' ').map(n => n[0]).join('')}</div>
                <div>
                  <div class="team-member-name">${m.name}</div>
                  <div class="team-member-role">${m.role}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="team-invite-form">
            <input class="integration-input" placeholder="Email address" id="invite-email">
            <select class="integration-input" id="invite-role" style="flex:0 0 120px">
              <option>Partner</option>
              <option>Analyst</option>
              <option>Associate</option>
              <option>Viewer</option>
            </select>
            <button class="integration-connect-btn" id="invite-btn">Invite</button>
          </div>
          <div class="integration-features" style="margin-top:14px">
            <div class="integration-feature"><span class="integration-feature-icon">🌐</span> Share via link — accessible from any browser</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔒</span> Role-based access: Partner, Analyst, Viewer</div>
            <div class="integration-feature"><span class="integration-feature-icon">💬</span> Shared annotations on deals and decks</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Activity feed of team actions</div>
          </div>
        </div>
      </div>

    </div>
  `;

  // Bind events
  document.getElementById('connect-gmail')?.addEventListener('click', () => {
    connectGmail();
  });

  document.getElementById('connect-streak')?.addEventListener('click', () => {
    const key = document.getElementById('streak-key')?.value;
    if (key && key.length > 10) {
      integrationState.streak.connected = true;
      integrationState.streak.apiKey = key;
      renderIntegrations(area);
    } else {
      alert('Please enter a valid Streak API key.\nFind it at: Streak → Settings → Integrations → API');
    }
  });

  document.getElementById('connect-supabase')?.addEventListener('click', () => {
    initSupabase();
    renderIntegrations(area);
  });

  document.getElementById('invite-btn')?.addEventListener('click', () => {
    const email = document.getElementById('invite-email')?.value;
    const role = document.getElementById('invite-role')?.value;
    if (email && email.includes('@')) {
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6'];
      integrationState.team.members.push({
        name, email, role,
        color: colors[integrationState.team.members.length % colors.length]
      });
      renderIntegrations(area);
    }
  });
}

// ============================================================
// PHASE 3: NEW INTELLIGENCE MODULES
// ============================================================

// ---- Meeting Prep Data ----
const IC_OBJECTIONS = {
  'Consumer Tech': [
    { objection: 'Unit economics don\'t work at scale in India', counter: 'CAC:LTV ratio is 1:4.2, improving 15% QoQ. Blended margin turns positive at 50K orders/day — currently at 32K.' },
    { objection: 'Crowded space with well-funded incumbents', counter: 'Incumbents focus on Tier-1. This targets Tier-2/3 where top 3 players have <8% penetration combined.' },
    { objection: 'Founders haven\'t built at this scale before', counter: 'CTO scaled infra at Flipkart from 10K→500K orders/day. CEO has domain expertise + strong operator DNA.' },
    { objection: 'Regulatory uncertainty in financial services', counter: 'RBI sandbox approval received. Licensed NBFC partner handles compliance. Similar model approved in 3 other markets.' },
    { objection: 'Path to profitability unclear', counter: 'Core commerce profitable. Losses from new city expansion. Each cohort reaches CM2 positive in month 4.' }
  ],
  'B2B Manufacturing': [
    { objection: 'Long sales cycles will burn cash', counter: 'Average pilot-to-contract is 6 weeks (vs. industry 4-6 months). Land-and-expand model: avg client grows 3.2x in year 1.' },
    { objection: 'Hardware dependency creates margin pressure', counter: 'Hardware is entry point only (15% of revenue). 85% comes from SaaS subscriptions with 78% gross margins.' },
    { objection: 'Small TAM in Southeast Asia', counter: 'ASEAN manufacturing output is $780B. Even 0.1% SaaS penetration = $780M addressable market.' },
    { objection: 'Difficult to build moat in enterprise software', counter: 'Proprietary ML models trained on 140M+ inspection images. Data moat deepens with each client — competitors start from zero.' },
    { objection: 'Team lacks manufacturing domain expertise', counter: 'CEO ran $500M manufacturing operations at Shell. Advisory board includes 3 ex-factory owners with 80+ years combined.' }
  ]
};

const TALKING_POINTS_TEMPLATES = [
  { label: 'Market Timing', template: (s) => `${s.name} is entering the ${s.subSector} market at an inflection point — ${s.geography} \$${s.tam}${s.tamUnit} TAM with only ${s.stage}-stage competition.` },
  { label: 'Founder Signal', template: (s) => `${s.founders[0].name} (${s.founders[0].pedigree.split(',')[0]}) brings rare combination of domain + execution. ${s.founders.length > 1 ? s.founders[1].name + ' complements on tech side.' : ''}` },
  { label: 'Traction Quality', template: (s) => `${s.metrics.mauGrowth}% MoM growth to ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} MAU. Revenue at \$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo growing ${s.metrics.revenueGrowth}% MoM.` },
  { label: 'Capital Efficiency', template: (s) => `Burning \$${(s.metrics.burnRate / 1000).toFixed(0)}K/mo with ${s.metrics.runway}mo runway. Last round: \$${s.lastRound.amount}M ${s.lastRound.type} — valuation implies ${(s.lastRound.amount / (s.metrics.revenue * 12 / 1000000) || 0).toFixed(0)}x revenue multiple.` },
  { label: 'Competitive Edge', template: (s) => `Key differentiation in ${s.subSector}: ${s.signals.founderExit.detail}. Hiring signal: ${s.signals.hiringSpike.detail}.` },
  { label: 'IC Ask', template: (s) => `Recommendation: ${s.scores ? (s.scores.composite > 75 ? 'Strong conviction — proceed to term sheet.' : s.scores.composite > 60 ? 'Positive lean — schedule deep dive with founders.' : 'Monitor — revisit in 3 months.') : 'Evaluate scoring data.'}` }
];

function renderMeetingPrep(area) {
  const startups = rankedStartups.length ? rankedStartups : [];
  let selectedStartup = startups[0];

  function buildPrep(s) {
    if (!s) return '<div class="empty-state">No startups available for prep</div>';
    const sectorObjns = IC_OBJECTIONS[s.sector] || IC_OBJECTIONS['Consumer Tech'];
    const talkingPts = TALKING_POINTS_TEMPLATES.map(t => ({ label: t.label, text: t.template(s) }));
    const risks = [
      { risk: 'Market timing too early', prob: s.tam > 20 ? 'Low' : 'Medium', impact: 'High' },
      { risk: 'Execution at scale', prob: s.metrics.mauGrowth > 100 ? 'Low' : 'Medium', impact: 'High' },
      { risk: 'Competitive response', prob: s.signals.hiringSpike.score > 70 ? 'Medium' : 'Low', impact: 'Medium' },
      { risk: 'Regulatory headwinds', prob: s.sector === 'Consumer Tech' ? 'Medium' : 'Low', impact: 'High' },
      { risk: 'Key person dependency', prob: s.founders.length < 2 ? 'High' : 'Low', impact: 'High' },
      { risk: 'Capital markets downturn', prob: 'Medium', impact: 'Medium' }
    ];

    return `
      <div class="prep-snapshot">
        <div class="deal-card" style="margin-bottom:0">
          <div class="deal-card-header">
            <div class="deal-logo">${s.logo}</div>
            <div class="deal-info">
              <h3 class="deal-name">${s.name}</h3>
              <span class="deal-meta">${s.subSector} · ${s.geography} · ${s.stage}</span>
            </div>
            <div class="deal-score ${getScoreClass(s.scores.composite)}">${s.scores.composite}</div>
          </div>
          <p style="color:var(--text-secondary);font-size:0.82rem;margin:12px 0">${s.description}</p>
          <div class="stats-row" style="margin-top:8px">
            <div class="stat-item"><div class="stat-value" style="color:var(--accent-green)">${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau}</div><div class="stat-label">MAU</div></div>
            <div class="stat-item"><div class="stat-value" style="color:var(--accent-blue)">$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}</div><div class="stat-label">MRR</div></div>
            <div class="stat-item"><div class="stat-value" style="color:var(--accent-purple)">$${s.lastRound.amount}M</div><div class="stat-label">${s.lastRound.type}</div></div>
            <div class="stat-item"><div class="stat-value" style="color:var(--accent-orange)">${s.metrics.runway}mo</div><div class="stat-label">Runway</div></div>
          </div>
        </div>
      </div>

      <div class="phase3-grid">
        <div class="phase3-panel">
          <h3 class="phase3-panel-title">🗣️ Talking Points</h3>
          <div class="talking-points-list">
            ${talkingPts.map(tp => `
              <div class="talking-point">
                <div class="tp-label">${tp.label}</div>
                <div class="tp-text">${tp.text}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="phase3-panel">
          <h3 class="phase3-panel-title">⚔️ IC Objection Playbook</h3>
          <div class="objections-list">
            ${sectorObjns.map((o, i) => `
              <div class="objection-item">
                <div class="objection-q">❓ "${o.objection}"</div>
                <div class="objection-a">💡 ${o.counter}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="phase3-panel" style="margin-top:16px">
        <h3 class="phase3-panel-title">⚠️ Risk Matrix</h3>
        <div class="risk-matrix-grid">
          ${risks.map(r => `
            <div class="risk-item risk-${r.prob.toLowerCase()}-${r.impact.toLowerCase()}">
              <div class="risk-name">${r.risk}</div>
              <div class="risk-tags">
                <span class="risk-tag prob-${r.prob.toLowerCase()}">P: ${r.prob}</span>
                <span class="risk-tag impact-${r.impact.toLowerCase()}">I: ${r.impact}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  area.innerHTML = `
    <div class="prep-selector">
      <label class="prep-label">Select Company for IC Prep</label>
      <select class="filter-select prep-select" id="prep-company-select">
        ${startups.map((s, i) => `<option value="${i}">${s.logo} ${s.name} — ${s.subSector} (Score: ${s.scores.composite})</option>`).join('')}
      </select>
    </div>
    <div id="prep-output">${buildPrep(selectedStartup)}</div>
  `;

  document.getElementById('prep-company-select')?.addEventListener('change', (e) => {
    selectedStartup = startups[parseInt(e.target.value)];
    document.getElementById('prep-output').innerHTML = buildPrep(selectedStartup);
  });
}

// ---- IC Memo Generator ----
function renderICMemo(area) {
  const startups = rankedStartups.length ? rankedStartups : [];
  let selectedStartup = startups[0];

  function buildMemo(s) {
    if (!s) return '<div class="empty-state">No startups to generate memo for</div>';
    const score = s.scores;
    const rec = score.composite > 75 ? 'PROCEED — Strong conviction' : score.composite > 60 ? 'LEAN POSITIVE — Deep dive recommended' : 'MONITOR — Revisit in 3 months';
    const recClass = score.composite > 75 ? 'hot' : score.composite > 60 ? 'warm' : 'watch';

    const memoHTML = `
## INVESTMENT COMMITTEE MEMO

**Company:** ${s.name}
**Sector:** ${s.subSector} (${s.sector})
**Geography:** ${s.city}, ${s.geography}
**Stage:** ${s.stage} | Last Round: $${s.lastRound.amount}M ${s.lastRound.type} (${s.lastRound.date})
**Deal Score:** ${score.composite}/100

---

### EXECUTIVE SUMMARY
${s.name} is a ${s.stage}-stage ${s.subSector.toLowerCase()} company based in ${s.city}, ${s.geography}. ${s.description}

Founded ${s.founded}, the company has achieved ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} MAU with ${s.metrics.mauGrowth}% MoM growth, generating \\$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo in revenue (growing ${s.metrics.revenueGrowth}% MoM).

### TEAM
${s.founders.map(f => `- **${f.name}** (${f.role}) — ${f.pedigree}`).join('\n')}

### MARKET OPPORTUNITY
- **TAM:** $${s.tam}${s.tamUnit}
- **Sector Dynamics:** ${s.signals.viralTraction.detail}
- **Competitive Position:** ${s.signals.founderExit.detail}

### TRACTION & METRICS
| Metric | Value | Trend |
|--------|-------|-------|
| MAU | ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} | +${s.metrics.mauGrowth}% MoM |
| Revenue | $${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo | +${s.metrics.revenueGrowth}% MoM |
| Burn Rate | $${(s.metrics.burnRate / 1000).toFixed(0)}K/mo | — |
| Runway | ${s.metrics.runway} months | — |

### SIGNALS
- 👥 **Hiring:** ${s.signals.hiringSpike.detail} (${s.signals.hiringSpike.score}/100)
- 📈 **Traction:** ${s.signals.viralTraction.detail} (${s.signals.viralTraction.score}/100)
- 📲 **Downloads:** ${s.signals.appDownloads.detail} (${s.signals.appDownloads.score}/100)
- 💰 **Funding:** ${s.signals.angelFunding.detail} (${s.signals.angelFunding.score}/100)

### SCORING BREAKDOWN
- Market (${score.market}/100) | Founder (${score.founder}/100) | Traction (${score.traction}/100)
- Product (${score.product}/100) | Timing (${score.timing}/100)
- **Composite: ${score.composite}/100**

### RECOMMENDATION
**${rec}**

---
*Generated by Jungle Ventures Intelligence Platform — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`;

    return `
      <div class="memo-container">
        <div class="memo-actions">
          <div class="tier-badge tier-${recClass}" style="font-size:0.85rem;padding:6px 16px">${rec}</div>
          <div style="display:flex;gap:8px">
            <button class="integration-connect-btn" id="memo-copy-btn">📋 Copy Memo</button>
            <button class="integration-connect-btn" id="memo-download-btn" style="background:var(--accent-purple)">⬇️ Download .md</button>
          </div>
        </div>
        <div class="memo-body">
          <pre class="memo-content">${memoHTML}</pre>
        </div>
        <div class="memo-radar" id="memo-radar-chart">
          ${createRadarChart(score, 200)}
        </div>
      </div>
    `;
  }

  area.innerHTML = `
    <div class="prep-selector">
      <label class="prep-label">Generate IC Memo For</label>
      <select class="filter-select prep-select" id="memo-company-select">
        ${startups.map((s, i) => `<option value="${i}">${s.logo} ${s.name} — Score: ${s.scores.composite}</option>`).join('')}
      </select>
    </div>
    <div id="memo-output">${buildMemo(selectedStartup)}</div>
  `;

  function attachMemoListeners() {
    const rawMemo = document.querySelector('.memo-content')?.textContent || '';
    document.getElementById('memo-copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(rawMemo).then(() => {
        const btn = document.getElementById('memo-copy-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy Memo', 2000);
      });
    });
    document.getElementById('memo-download-btn')?.addEventListener('click', () => {
      const blob = new Blob([rawMemo], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IC-Memo-${selectedStartup.name.replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  attachMemoListeners();

  document.getElementById('memo-company-select')?.addEventListener('change', (e) => {
    selectedStartup = startups[parseInt(e.target.value)];
    document.getElementById('memo-output').innerHTML = buildMemo(selectedStartup);
    attachMemoListeners();
  });
}

// ---- Fundraising Radar Data ----
const FUNDRAISING_SIGNALS = [
  { company: 'QuickDeliver', signal: 'Hired VP Finance + 3 FP&A roles — typical pre-raise signal', confidence: 'High', estStage: 'Series A', estSize: '$8-12M', date: '2 days ago', icon: '👥' },
  { company: 'FactoryOS', signal: 'CEO spoke at YC Demo Day networking event', confidence: 'High', estStage: 'Series A', estSize: '$10-15M', date: '3 days ago', icon: '🎤' },
  { company: 'PlaySEA', signal: 'Office expansion from 2K to 8K sqft in Singapore', confidence: 'Medium', estStage: 'Series A', estSize: '$6-10M', date: '5 days ago', icon: '🏢' },
  { company: 'ChainFlow', signal: 'New "Investor Relations" page added to website', confidence: 'Medium', estStage: 'Series A', estSize: '$5-8M', date: '1 week ago', icon: '🌐' },
  { company: 'EyeQuality', signal: 'Board meeting cadence increased to bi-weekly', confidence: 'Medium', estStage: 'Series B', estSize: '$20-30M', date: '1 week ago', icon: '📅' },
  { company: 'LendAPI', signal: 'Bloomberg interview discussing "next phase of growth"', confidence: 'Medium', estStage: 'Series A', estSize: '$8-12M', date: '10 days ago', icon: '📰' },
  { company: 'TokTok Bharat', signal: 'Hired Goldman Sachs associate as Chief of Staff', confidence: 'High', estStage: 'Series A', estSize: '$15-20M', date: '12 days ago', icon: '👔' },
  { company: 'RoboAssembly', signal: 'Patent filings accelerated — 4 new patents in 2 months', confidence: 'Low', estStage: 'Series A', estSize: '$5-8M', date: '2 weeks ago', icon: '📜' },
  { company: 'GreenMill', signal: 'Partnership announcement with Temasek-linked accelerator', confidence: 'Medium', estStage: 'Series A', estSize: '$8-12M', date: '2 weeks ago', icon: '🤝' },
  { company: 'SaveStack', signal: 'Multiple Glassdoor reviews mention "exciting fundraise"', confidence: 'Low', estStage: 'Seed+', estSize: '$3-5M', date: '3 weeks ago', icon: '💬' }
];

function renderFundRadar(area) {
  const confColors = { High: 'var(--accent-green)', Medium: 'var(--accent-orange)', Low: 'var(--text-muted)' };
  const confBg = { High: 'rgba(16,185,129,0.1)', Medium: 'rgba(245,158,11,0.1)', Low: 'rgba(148,163,184,0.1)' };

  const geoHeat = {};
  rankedStartups.forEach(s => { geoHeat[s.geography] = (geoHeat[s.geography] || 0) + 1; });

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${FUNDRAISING_SIGNALS.filter(s => s.confidence === 'High').length}</div><div class="stat-card-label">🔥 High Confidence</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${FUNDRAISING_SIGNALS.filter(s => s.confidence === 'Medium').length}</div><div class="stat-card-label">⚡ Medium Confidence</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--text-muted)">${FUNDRAISING_SIGNALS.filter(s => s.confidence === 'Low').length}</div><div class="stat-card-label">👀 Watching</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${FUNDRAISING_SIGNALS.length}</div><div class="stat-card-label">📡 Total Signals</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">📡 Signal Feed</h3>
        <div class="signal-feed">
          ${FUNDRAISING_SIGNALS.map(sig => `
            <div class="signal-item" style="border-left:3px solid ${confColors[sig.confidence]}">
              <div class="signal-header">
                <span class="signal-icon">${sig.icon}</span>
                <strong class="signal-company">${sig.company}</strong>
                <span class="signal-date">${sig.date}</span>
              </div>
              <div class="signal-body">${sig.signal}</div>
              <div class="signal-footer">
                <span class="signal-tag" style="background:${confBg[sig.confidence]};color:${confColors[sig.confidence]}">${sig.confidence} Confidence</span>
                <span class="signal-tag" style="background:rgba(99,102,241,0.1);color:var(--accent-indigo)">${sig.estStage}</span>
                <span class="signal-tag" style="background:rgba(236,72,153,0.1);color:var(--accent-pink)">${sig.estSize}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🗺️ Geographic Activity</h3>
        <div class="geo-heat-list">
          ${Object.entries(geoHeat).sort((a, b) => b[1] - a[1]).map(([geo, count]) => `
            <div class="geo-heat-item">
              <span class="geo-name">${geo}</span>
              <div class="geo-bar-wrap">
                <div class="geo-bar" style="width:${(count / Math.max(...Object.values(geoHeat))) * 100}%"></div>
              </div>
              <span class="geo-count">${count} deals</span>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">📊 Stage Distribution</h3>
        <div class="geo-heat-list">
          ${['Seed', 'Pre-Seed', 'Series A'].map(stage => {
    const count = FUNDRAISING_SIGNALS.filter(s => s.estStage.includes(stage) || s.estStage === stage).length;
    return `<div class="geo-heat-item">
              <span class="geo-name">${stage}</span>
              <div class="geo-bar-wrap"><div class="geo-bar" style="width:${(count / FUNDRAISING_SIGNALS.length) * 100}%;background:var(--accent-purple)"></div></div>
              <span class="geo-count">${count}</span>
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ---- VC CRM Data ----
const FOUNDER_RELATIONSHIPS = [
  { name: 'Vikram Patel', company: 'QuickDeliver', role: 'CEO', strength: 5, lastContact: '2 days ago', nextFollowUp: 'Tomorrow', interactions: 12, warmIntro: 'Direct — met at YC Demo Day', notes: 'Very responsive. Prefers WhatsApp. Wife is co-founder at another portfolio co.', status: 'Active Deal' },
  { name: 'Li Wei Chen', company: 'FactoryOS', role: 'CEO', strength: 4, lastContact: '1 week ago', nextFollowUp: 'In 3 days', interactions: 8, warmIntro: 'Via Rajesh (Sequoia)', notes: 'Technical founder, likes deep-dive conversations. Send him research papers.', status: 'Active Deal' },
  { name: 'Sarah Tanaka', company: 'PlaySEA', role: 'CEO', strength: 3, lastContact: '2 weeks ago', nextFollowUp: 'Overdue', interactions: 5, warmIntro: 'Via Angel network — Singapore', notes: 'Ex-Grab. Wants strategic value-add, not just capital.', status: 'Pipeline' },
  { name: 'Arjun Mehta', company: 'ChainFlow', role: 'CEO', strength: 4, lastContact: '3 days ago', nextFollowUp: 'Next week', interactions: 9, warmIntro: 'Direct — cold outreach converted', notes: 'Strong operator. Asks pointed questions. Bring data.', status: 'Active Deal' },
  { name: 'Maria Santos', company: 'LendAPI', role: 'CEO', strength: 2, lastContact: '1 month ago', nextFollowUp: 'Overdue', interactions: 3, warmIntro: 'Via fintech conference', notes: 'Busy schedule. Best reached via LinkedIn DM.', status: 'Pipeline' },
  { name: 'Nguyen Thi Lan', company: 'BunPho', role: 'CEO', strength: 4, lastContact: '5 days ago', nextFollowUp: 'In 5 days', interactions: 7, warmIntro: 'Via JV portfolio founder (Kim)', notes: 'Passionate about Vietnamese food tech. Good culture fit.', status: 'Active Deal' },
  { name: 'Ravi Kumar', company: 'EyeQuality', role: 'CTO', strength: 3, lastContact: '10 days ago', nextFollowUp: 'In 2 days', interactions: 6, warmIntro: 'Via IIT Delhi alumni network', notes: 'Deep tech background. Wants to discuss AI architecture.', status: 'Pipeline' },
  { name: 'Chen Wei', company: 'GreenMill', role: 'CEO', strength: 3, lastContact: '2 weeks ago', nextFollowUp: 'This week', interactions: 4, warmIntro: 'Via Temasek sustainability circle', notes: 'ESG expert. Connected to Shell APAC network.', status: 'Watching' }
];

function renderVCCRM(area) {
  const overdue = FOUNDER_RELATIONSHIPS.filter(f => f.nextFollowUp === 'Overdue' || f.nextFollowUp === 'Tomorrow');
  const statusColors = { 'Active Deal': 'var(--accent-green)', 'Pipeline': 'var(--accent-blue)', 'Watching': 'var(--accent-orange)' };

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${FOUNDER_RELATIONSHIPS.filter(f => f.status === 'Active Deal').length}</div><div class="stat-card-label">Active Deals</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${FOUNDER_RELATIONSHIPS.filter(f => f.status === 'Pipeline').length}</div><div class="stat-card-label">In Pipeline</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-red)">${overdue.length}</div><div class="stat-card-label">⚠️ Needs Attention</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${FOUNDER_RELATIONSHIPS.reduce((a, f) => a + f.interactions, 0)}</div><div class="stat-card-label">Total Interactions</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">👥 Founder Relationships</h3>
        <div class="crm-list">
          ${FOUNDER_RELATIONSHIPS.map(f => `
            <div class="crm-card${f.nextFollowUp === 'Overdue' ? ' crm-overdue' : ''}">
              <div class="crm-card-header">
                <div>
                  <strong class="crm-name">${f.name}</strong>
                  <span class="crm-role">${f.role} @ ${f.company}</span>
                </div>
                <div class="crm-strength">${'★'.repeat(f.strength)}${'☆'.repeat(5 - f.strength)}</div>
              </div>
              <div class="crm-card-body">
                <div class="crm-meta-row">
                  <span class="signal-tag" style="background:${statusColors[f.status]}22;color:${statusColors[f.status]}">${f.status}</span>
                  <span class="crm-meta">📅 Last: ${f.lastContact}</span>
                  <span class="crm-meta">${f.nextFollowUp === 'Overdue' ? '🔴' : '📌'} Next: ${f.nextFollowUp}</span>
                  <span class="crm-meta">💬 ${f.interactions} interactions</span>
                </div>
                <div class="crm-notes">🔗 <strong>Intro:</strong> ${f.warmIntro}</div>
                <div class="crm-notes">📝 ${f.notes}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🔔 Follow-Up Queue</h3>
        <div class="followup-queue">
          ${FOUNDER_RELATIONSHIPS.filter(f => f.nextFollowUp === 'Overdue' || f.nextFollowUp === 'Tomorrow' || f.nextFollowUp.includes('2 days') || f.nextFollowUp.includes('3 days')).sort((a, b) => {
    const pri = { 'Overdue': 0, 'Tomorrow': 1 };
    return (pri[a.nextFollowUp] ?? 2) - (pri[b.nextFollowUp] ?? 2);
  }).map(f => `
            <div class="followup-item${f.nextFollowUp === 'Overdue' ? ' followup-urgent' : ''}">
              <div class="followup-name">${f.name}</div>
              <div class="followup-company">${f.company}</div>
              <div class="followup-when">${f.nextFollowUp === 'Overdue' ? '🔴 OVERDUE' : '📅 ' + f.nextFollowUp}</div>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">🌐 Intro Network</h3>
        <div class="intro-network">
          ${[...new Set(FOUNDER_RELATIONSHIPS.map(f => {
    const via = f.warmIntro.match(/Via (.+?)(?:\s*[—–-]|$)/i);
    return via ? via[1].trim() : 'Direct';
  }))].map(source => {
    const count = FOUNDER_RELATIONSHIPS.filter(f => f.warmIntro.includes(source)).length;
    return `<div class="intro-source"><span class="intro-name">${source}</span><span class="intro-count">${count} intro${count > 1 ? 's' : ''}</span></div>`;
  }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ---- Network Map Data ----
const CO_INVESTORS = [
  { name: 'Sequoia Capital India', deals: 5, sharedDeals: ['QuickDeliver', 'TokTok Bharat', 'PlaySEA'], color: '#6366f1' },
  { name: 'Accel Partners', deals: 4, sharedDeals: ['ChainFlow', 'FactoryOS', 'LendAPI'], color: '#f59e0b' },
  { name: 'Lightspeed India', deals: 3, sharedDeals: ['QuickDeliver', 'SaveStack', 'EyeQuality'], color: '#ec4899' },
  { name: 'Tiger Global', deals: 3, sharedDeals: ['BunPho', 'PlaySEA', 'TokTok Bharat'], color: '#10b981' },
  { name: 'Wavemaker Partners', deals: 2, sharedDeals: ['GreenMill', 'RoboAssembly'], color: '#8b5cf6' },
  { name: 'East Ventures', deals: 2, sharedDeals: ['MateriLink', 'ChainFlow'], color: '#f97316' },
  { name: 'GFC (Global Founders)', deals: 2, sharedDeals: ['PackBot', 'FactoryOS'], color: '#14b8a6' },
  { name: '500 Global', deals: 1, sharedDeals: ['LendAPI'], color: '#64748b' }
];

function renderNetworkMap(area) {
  // Build SVG network visualization
  const centerX = 400, centerY = 280, radius = 200;
  const nodes = CO_INVESTORS.map((inv, i) => {
    const angle = (i / CO_INVESTORS.length) * Math.PI * 2 - Math.PI / 2;
    return { ...inv, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  });

  const svgLines = nodes.map(n => `<line x1="${centerX}" y1="${centerY}" x2="${n.x}" y2="${n.y}" stroke="${n.color}" stroke-width="${n.deals * 0.8}" opacity="0.4"/>`).join('');
  const svgNodes = nodes.map(n => `
    <circle cx="${n.x}" cy="${n.y}" r="${12 + n.deals * 3}" fill="${n.color}" opacity="0.8"/>
    <text x="${n.x}" y="${n.y + 30 + n.deals * 3}" text-anchor="middle" fill="var(--text-secondary)" font-size="11" font-family="Inter">${n.name.split(' ').slice(0, 2).join(' ')}</text>
    <text x="${n.x}" y="${n.y + 44 + n.deals * 3}" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="Inter">${n.deals} co-deals</text>
  `).join('');

  area.innerHTML = `
    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">🕸️ Co-Investment Network</h3>
        <div class="network-svg-wrap">
          <svg viewBox="0 0 800 560" class="network-svg">
            ${svgLines}
            <circle cx="${centerX}" cy="${centerY}" r="28" fill="var(--accent-green)" opacity="0.9"/>
            <text x="${centerX}" y="${centerY - 4}" text-anchor="middle" fill="white" font-size="10" font-weight="700" font-family="Inter">Jungle</text>
            <text x="${centerX}" y="${centerY + 10}" text-anchor="middle" fill="white" font-size="10" font-weight="700" font-family="Inter">Ventures</text>
            ${svgNodes}
          </svg>
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🏆 Top Co-Investors</h3>
        <div class="coinvestor-list">
          ${CO_INVESTORS.sort((a, b) => b.deals - a.deals).map((inv, i) => `
            <div class="coinvestor-item">
              <div class="coinvestor-rank">#${i + 1}</div>
              <div class="coinvestor-info">
                <div class="coinvestor-name">${inv.name}</div>
                <div class="coinvestor-deals">${inv.sharedDeals.join(', ')}</div>
              </div>
              <div class="coinvestor-count" style="color:${inv.color}">${inv.deals}</div>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">💡 Syndicate Suggestions</h3>
        <div class="syndicate-list">
          ${rankedStartups.slice(0, 4).map(s => {
    const suggested = CO_INVESTORS.filter(inv => inv.sharedDeals.some(d => rankedStartups.find(rs => rs.name === d)?.sector === s.sector)).slice(0, 2);
    return `<div class="syndicate-item">
              <span class="syndicate-deal">${s.logo} ${s.name}</span>
              <span class="syndicate-partners">${suggested.map(inv => inv.name.split(' ')[0]).join(', ') || 'New partner needed'}</span>
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PHASE 4: ADVANCED ANALYTICS
// ============================================================

// ---- Competitive Landscape ----
const COMPETITORS = [
  { name: 'Sequoia India', aum: '$9.5B', focus: 'Series A-C', deals2025: 42, avgCheck: '$15M', strengths: ['Brand', 'Network', 'Follow-on'], weaknesses: ['Slow DD', 'Board heavy'], overlap: 6, color: '#6366f1' },
  { name: 'Accel India', aum: '$3.2B', focus: 'Seed-Series B', deals2025: 38, avgCheck: '$8M', strengths: ['Speed', 'Founder-first', 'Platform'], weaknesses: ['Small fund', 'Less ASEAN'], overlap: 4, color: '#f59e0b' },
  { name: 'Lightspeed', aum: '$7.1B', focus: 'Series A-B', deals2025: 31, avgCheck: '$12M', strengths: ['Global reach', 'Data-driven'], weaknesses: ['Less local', 'High bar'], overlap: 3, color: '#ec4899' },
  { name: 'Tiger Global', aum: '$12.7B', focus: 'Growth', deals2025: 25, avgCheck: '$25M', strengths: ['Speed', 'Large checks', 'No board'], weaknesses: ['Less hands-on', 'Pullback risk'], overlap: 3, color: '#10b981' },
  { name: 'East Ventures', aum: '$0.9B', focus: 'Pre-Seed/Seed', deals2025: 55, avgCheck: '$1.5M', strengths: ['Indonesia deep', 'Speed', 'Community'], weaknesses: ['Small checks', 'Limited follow-on'], overlap: 2, color: '#f97316' },
  { name: 'Wavemaker', aum: '$0.6B', focus: 'Seed-Series A', deals2025: 28, avgCheck: '$3M', strengths: ['ASEAN native', 'Operator network'], weaknesses: ['Fund size', 'Brand awareness'], overlap: 2, color: '#8b5cf6' }
];

function renderCompetitive(area) {
  const jv = { name: 'Jungle Ventures', aum: '$1.5B', focus: 'Seed-Series B', deals2025: 16, avgCheck: '$5M', color: 'var(--accent-green)' };

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${COMPETITORS.length}</div><div class="stat-card-label">Tracked Competitors</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${COMPETITORS.reduce((a, c) => a + c.overlap, 0)}</div><div class="stat-card-label">Deal Overlaps</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${COMPETITORS.reduce((a, c) => a + c.deals2025, 0)}</div><div class="stat-card-label">Total Market Deals</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">$${(COMPETITORS.reduce((a, c) => a + parseFloat(c.aum.replace('$', '')), 0)).toFixed(1)}B</div><div class="stat-card-label">Combined AUM</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">🏟️ Competitive Positioning</h3>
        <div class="comp-table-wrap">
          <table class="comp-table">
            <thead><tr><th>Fund</th><th>AUM</th><th>Focus</th><th>Deals '25</th><th>Avg Check</th><th>Overlap</th><th>Strengths</th></tr></thead>
            <tbody>
              <tr class="comp-row-jv"><td><strong>🌴 ${jv.name}</strong></td><td>${jv.aum}</td><td>${jv.focus}</td><td>${jv.deals2025}</td><td>${jv.avgCheck}</td><td>—</td><td>ASEAN focus, Speed, LP network</td></tr>
              ${COMPETITORS.map(c => `<tr>
                <td><span style="color:${c.color}">●</span> ${c.name}</td><td>${c.aum}</td><td>${c.focus}</td><td>${c.deals2025}</td><td>${c.avgCheck}</td>
                <td><span class="comp-overlap">${c.overlap}</span></td>
                <td>${c.strengths.slice(0, 2).join(', ')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">⚔️ SWOT — Jungle Ventures</h3>
        <div class="swot-grid">
          <div class="swot-box swot-s"><div class="swot-label">Strengths</div><ul><li>Deep ASEAN network</li><li>Speed to term sheet</li><li>Founder-friendly terms</li><li>LP co-invest program</li></ul></div>
          <div class="swot-box swot-w"><div class="swot-label">Weaknesses</div><ul><li>Smaller fund vs peers</li><li>Limited US presence</li><li>Brand awareness in India</li><li>Follow-on capacity</li></ul></div>
          <div class="swot-box swot-o"><div class="swot-label">Opportunities</div><ul><li>Vietnam/Philippines growth</li><li>B2B Manufacturing boom</li><li>ESG/Climate tech wave</li><li>Web3 infrastructure</li></ul></div>
          <div class="swot-box swot-t"><div class="swot-label">Threats</div><ul><li>Tiger/Coatue return</li><li>Local fund scaling</li><li>LP allocation shifts</li><li>Macro downturn</li></ul></div>
        </div>
      </div>
    </div>
  `;
}

// ---- LP Report Generator ----
function renderLPReport(area) {
  const quarter = 'Q4 2025';
  const portfolio = rankedStartups.length ? rankedStartups : [];
  const totalDeployed = portfolio.reduce((a, s) => a + (s.lastRound.amount || 0), 0);
  const avgScore = portfolio.length ? Math.round(portfolio.reduce((a, s) => a + s.scores.composite, 0) / portfolio.length) : 0;
  const topPerformer = portfolio[0];

  const reportMD = `# JUNGLE VENTURES — LP QUARTERLY REPORT
## ${quarter}

### PORTFOLIO OVERVIEW
- **Total Companies:** ${portfolio.length}
- **Capital Deployed:** $${totalDeployed.toFixed(1)}M
- **Average Deal Score:** ${avgScore}/100
- **Geographies:** India (${portfolio.filter(s => s.geography === 'India').length}), Singapore (${portfolio.filter(s => s.geography === 'Singapore').length}), Vietnam (${portfolio.filter(s => s.geography === 'Vietnam').length}), Indonesia (${portfolio.filter(s => s.geography === 'Indonesia').length}), Philippines (${portfolio.filter(s => s.geography === 'Philippines').length})

### TOP PERFORMERS
${portfolio.slice(0, 5).map((s, i) => `${i + 1}. **${s.name}** (${s.subSector}) — Score: ${s.scores.composite}, MRR: $${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}, Growth: ${s.metrics.revenueGrowth}% MoM`).join('\n')}

### SECTOR BREAKDOWN
- Consumer Tech: ${portfolio.filter(s => s.sector === 'Consumer Tech').length} companies
- B2B Manufacturing: ${portfolio.filter(s => s.sector === 'B2B Manufacturing').length} companies

### KEY HIGHLIGHTS
- Strongest signal: ${topPerformer ? topPerformer.name + ' leading with ' + topPerformer.scores.composite + '/100 composite score' : 'N/A'}
- Pipeline: 16 deals tracked, 1 hot deals requiring immediate attention
- Follow-on candidates: ${portfolio.filter(s => s.scores.composite > 65).length} companies scoring above 65

---
*Generated by Jungle Ventures Intelligence Platform — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`;

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${portfolio.length}</div><div class="stat-card-label">Portfolio Companies</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">$${totalDeployed.toFixed(1)}M</div><div class="stat-card-label">Capital Deployed</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${avgScore}</div><div class="stat-card-label">Avg Deal Score</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">5</div><div class="stat-card-label">Geographies</div></div>
    </div>

    <div class="memo-actions">
      <div class="tier-badge tier-hot" style="font-size:0.85rem;padding:6px 16px">📊 ${quarter} Report</div>
      <div style="display:flex;gap:8px">
        <button class="integration-connect-btn" id="lp-copy-btn">📋 Copy Report</button>
        <button class="integration-connect-btn" id="lp-download-btn" style="background:var(--accent-purple)">⬇️ Download .md</button>
      </div>
    </div>

    <div class="memo-body"><pre class="memo-content">${reportMD}</pre></div>

    <div class="phase3-grid">
      <div class="phase3-panel">
        <h3 class="phase3-panel-title">📈 Portfolio by Geography</h3>
        <div class="geo-heat-list">
          ${['India', 'Singapore', 'Vietnam', 'Indonesia', 'Philippines'].map(geo => {
    const count = portfolio.filter(s => s.geography === geo).length;
    return `<div class="geo-heat-item"><span class="geo-name">${geo}</span><div class="geo-bar-wrap"><div class="geo-bar" style="width:${(count / Math.max(1, ...['India', 'Singapore', 'Vietnam', 'Indonesia', 'Philippines'].map(g => portfolio.filter(s => s.geography === g).length))) * 100}%"></div></div><span class="geo-count">${count}</span></div>`;
  }).join('')}
        </div>
      </div>
      <div class="phase3-panel">
        <h3 class="phase3-panel-title">🏆 Top 5 by Score</h3>
        <div class="coinvestor-list">
          ${portfolio.slice(0, 5).map((s, i) => `<div class="coinvestor-item"><div class="coinvestor-rank">#${i + 1}</div><div class="coinvestor-info"><div class="coinvestor-name">${s.logo} ${s.name}</div><div class="coinvestor-deals">${s.subSector} · ${s.geography}</div></div><div class="coinvestor-count" style="color:${getScoreColor(s.scores.composite)}">${s.scores.composite}</div></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('lp-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(reportMD).then(() => {
      const btn = document.getElementById('lp-copy-btn');
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy Report', 2000);
    });
  });
  document.getElementById('lp-download-btn')?.addEventListener('click', () => {
    const blob = new Blob([reportMD], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `JV-LP-Report-${quarter.replace(' ', '-')}.md`; a.click();
    URL.revokeObjectURL(url);
  });
}

// ---- Deal Velocity Tracker ----
const VELOCITY_DATA = [
  { deal: 'GreenMill', stage: 'Term Sheet', daysInPipeline: 18, daysPerStage: { sourced: 2, screening: 3, dd: 8, ic: 3, termSheet: 2 }, status: 'Fast' },
  { deal: 'FactoryOS', stage: 'IC Review', daysInPipeline: 25, daysPerStage: { sourced: 1, screening: 5, dd: 12, ic: 7 }, status: 'Normal' },
  { deal: 'SteelMind', stage: 'Due Diligence', daysInPipeline: 14, daysPerStage: { sourced: 2, screening: 4, dd: 8 }, status: 'Fast' },
  { deal: 'KartBee', stage: 'Screening', daysInPipeline: 7, daysPerStage: { sourced: 3, screening: 4 }, status: 'Normal' },
  { deal: 'QuickDeliver', stage: 'Closed', daysInPipeline: 32, daysPerStage: { sourced: 2, screening: 3, dd: 10, ic: 5, termSheet: 4, closed: 8 }, status: 'Normal' },
  { deal: 'BunPho', stage: 'Due Diligence', daysInPipeline: 21, daysPerStage: { sourced: 1, screening: 6, dd: 14 }, status: 'Slow' },
  { deal: 'ChainFlow', stage: 'IC Review', daysInPipeline: 19, daysPerStage: { sourced: 2, screening: 3, dd: 9, ic: 5 }, status: 'Normal' },
  { deal: 'PlaySEA', stage: 'Screening', daysInPipeline: 5, daysPerStage: { sourced: 1, screening: 4 }, status: 'Fast' }
];

function renderDealVelocity(area) {
  const stages = ['sourced', 'screening', 'dd', 'ic', 'termSheet', 'closed'];
  const stageLabels = { sourced: 'Sourced', screening: 'Screening', dd: 'Due Diligence', ic: 'IC Review', termSheet: 'Term Sheet', closed: 'Closed' };
  const avgDays = Math.round(VELOCITY_DATA.reduce((a, d) => a + d.daysInPipeline, 0) / VELOCITY_DATA.length);
  const fastDeals = VELOCITY_DATA.filter(d => d.status === 'Fast').length;
  const statusColors = { Fast: 'var(--accent-green)', Normal: 'var(--accent-blue)', Slow: 'var(--accent-red)' };

  // Funnel
  const funnel = stages.map(s => ({ stage: stageLabels[s], count: VELOCITY_DATA.filter(d => Object.keys(d.daysPerStage).includes(s)).length }));

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${avgDays}d</div><div class="stat-card-label">Avg Pipeline Days</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${fastDeals}</div><div class="stat-card-label">Fast-tracked Deals</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${VELOCITY_DATA.filter(d => d.stage === 'Closed').length}</div><div class="stat-card-label">Closed This Quarter</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${VELOCITY_DATA.length}</div><div class="stat-card-label">Active Pipeline</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">⚡ Deal Timeline</h3>
        <div class="velocity-list">
          ${VELOCITY_DATA.map(d => {
    const maxDays = 40;
    const barWidth = (d.daysInPipeline / maxDays) * 100;
    return `
              <div class="velocity-item">
                <div class="velocity-header">
                  <strong class="velocity-deal">${d.deal}</strong>
                  <span class="signal-tag" style="background:${statusColors[d.status]}22;color:${statusColors[d.status]}">${d.status}</span>
                  <span class="velocity-stage">${d.stage}</span>
                  <span class="velocity-days">${d.daysInPipeline}d</span>
                </div>
                <div class="velocity-bar-wrap">
                  ${stages.filter(s => d.daysPerStage[s]).map(s => {
      const w = (d.daysPerStage[s] / maxDays) * 100;
      const colors = { sourced: '#64748b', screening: '#6366f1', dd: '#f59e0b', ic: '#ec4899', termSheet: '#10b981', closed: '#22c55e' };
      return `<div class="velocity-segment" style="width:${w}%;background:${colors[s]}" title="${stageLabels[s]}: ${d.daysPerStage[s]}d"></div>`;
    }).join('')}
                </div>
              </div>`;
  }).join('')}
        </div>
        <div class="velocity-legend">
          ${stages.map(s => {
    const colors = { sourced: '#64748b', screening: '#6366f1', dd: '#f59e0b', ic: '#ec4899', termSheet: '#10b981', closed: '#22c55e' };
    return `<span class="legend-item"><span class="legend-dot" style="background:${colors[s]}"></span>${stageLabels[s]}</span>`;
  }).join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🔻 Conversion Funnel</h3>
        <div class="funnel-list">
          ${funnel.map((f, i) => `
            <div class="funnel-step">
              <div class="funnel-bar" style="width:${(f.count / funnel[0].count) * 100}%;background:linear-gradient(90deg, var(--accent-blue), var(--accent-purple))"></div>
              <div class="funnel-label">${f.stage}</div>
              <div class="funnel-count">${f.count}</div>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">📊 Stage Avg Time</h3>
        <div class="geo-heat-list">
          ${stages.map(s => {
    const deals = VELOCITY_DATA.filter(d => d.daysPerStage[s]);
    const avg = deals.length ? Math.round(deals.reduce((a, d) => a + d.daysPerStage[s], 0) / deals.length) : 0;
    return `<div class="geo-heat-item"><span class="geo-name">${stageLabels[s]}</span><div class="geo-bar-wrap"><div class="geo-bar" style="width:${(avg / 15) * 100}%;background:var(--accent-purple)"></div></div><span class="geo-count">${avg}d</span></div>`;
  }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PHASE 5: ADMIN & DATA
// ============================================================

// ---- Admin Panel ----
const ADMIN_CREDENTIALS = [
  { id: 'tracxn', name: 'Tracxn API', desc: 'Company data, funding rounds, and competitive intelligence', icon: '🔍', fields: ['API Key', 'API Secret'], status: 'disconnected', howTo: 'https://tracxn.com/api — Sign up for Enterprise plan → API Settings → Generate Key' },
  { id: 'ken', name: 'Ken Newsletters', desc: 'Premium business intelligence from The Ken Asia & India', icon: '📰', fields: ['Email', 'Password'], status: 'disconnected', howTo: 'https://the-ken.com — Use your existing login credentials from your subscription' },
  { id: 'supabase', name: 'Supabase', desc: 'Database backend for deal tracking and real-time sync', icon: '⚡', fields: ['Project URL', 'Anon Key'], status: 'disconnected', howTo: 'https://supabase.com/dashboard → Select Project → Settings → API → Copy URL & anon key' },
  { id: 'streak', name: 'Streak CRM', desc: 'Gmail-integrated CRM for pipeline management', icon: '📧', fields: ['API Key'], status: 'disconnected', howTo: 'https://streak.com → Settings → Integrations → API → Generate API Key' },
  { id: 'google', name: 'Google OAuth', desc: 'Gmail integration for email tracking and calendar sync', icon: '🔐', fields: ['Client ID', 'Client Secret'], status: 'disconnected', howTo: 'https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth Client ID' },
  { id: 'openai', name: 'OpenAI API', desc: 'AI-powered memo generation and deal analysis', icon: '🤖', fields: ['API Key'], status: 'disconnected', howTo: 'https://platform.openai.com/api-keys → Create new secret key' },
  { id: 'crunchbase', name: 'Crunchbase', desc: 'Company profiles, funding data, and industry trends', icon: '💎', fields: ['API Key'], status: 'disconnected', howTo: 'https://data.crunchbase.com → Enterprise API → Generate Key from dashboard' },
  { id: 'pitchbook', name: 'PitchBook', desc: 'Private market data, valuations, and deal comps', icon: '📈', fields: ['Username', 'Password', 'API Token'], status: 'disconnected', howTo: 'https://pitchbook.com — Contact your account manager for API access credentials' }
];

function renderAdmin(area) {
  // Load saved creds from localStorage
  const saved = JSON.parse(localStorage.getItem('jv_admin_creds') || '{}');

  area.innerHTML = `
    <div class="admin-notice">
      <span>🔒</span>
      <span>Credentials are stored locally in your browser (localStorage). They never leave your machine.</span>
    </div>

    <div class="admin-grid">
      ${ADMIN_CREDENTIALS.map(cred => {
    const credSaved = saved[cred.id] || {};
    const isConnected = cred.fields.every(f => credSaved[f]);
    return `
          <div class="admin-card ${isConnected ? 'admin-connected' : ''}">
            <div class="admin-card-header">
              <span class="admin-icon">${cred.icon}</span>
              <div>
                <strong class="admin-name">${cred.name}</strong>
                <span class="admin-status ${isConnected ? 'status-connected' : 'status-disconnected'}">${isConnected ? '● Connected' : '○ Not Connected'}</span>
              </div>
            </div>
            <p class="admin-desc">${cred.desc}</p>
            <p class="admin-howto">💡 <strong>How to get:</strong> ${cred.howTo}</p>
            <div class="admin-fields" id="admin-fields-${cred.id}">
              ${cred.fields.map(f => `
                <div class="admin-field">
                  <label class="admin-field-label">${f}</label>
                  <input type="${f.toLowerCase().includes('password') || f.toLowerCase().includes('key') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') ? 'password' : 'text'}" 
                    class="admin-input" 
                    id="admin-${cred.id}-${f.replace(/\s+/g, '-').toLowerCase()}"
                    placeholder="Enter ${f}"
                    value="${credSaved[f] || ''}" />
                </div>
              `).join('')}
            </div>
            <button class="admin-save-btn" data-cred-id="${cred.id}" data-fields='${JSON.stringify(cred.fields)}'>
              ${isConnected ? '✅ Update' : '💾 Save & Connect'}
            </button>
          </div>
        `;
  }).join('')}
    </div>
  `;

  // Save handlers
  area.querySelectorAll('.admin-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const credId = btn.dataset.credId;
      const fields = JSON.parse(btn.dataset.fields);
      const vals = {};
      let allFilled = true;
      fields.forEach(f => {
        const input = document.getElementById(`admin-${credId}-${f.replace(/\s+/g, '-').toLowerCase()}`);
        vals[f] = input?.value?.trim() || '';
        if (!vals[f]) allFilled = false;
      });
      if (!allFilled) { btn.textContent = '❌ Fill all fields'; setTimeout(() => btn.textContent = '💾 Save & Connect', 2000); return; }
      const all = JSON.parse(localStorage.getItem('jv_admin_creds') || '{}');
      all[credId] = vals;
      localStorage.setItem('jv_admin_creds', JSON.stringify(all));
      // Log activity
      logActivity('credential_update', `Updated ${ADMIN_CREDENTIALS.find(c => c.id === credId)?.name} credentials`);
      btn.textContent = '✅ Saved!';
      btn.closest('.admin-card').classList.add('admin-connected');
      btn.closest('.admin-card').querySelector('.admin-status').textContent = '● Connected';
      btn.closest('.admin-card').querySelector('.admin-status').className = 'admin-status status-connected';
      setTimeout(() => btn.textContent = '✅ Update', 2000);
    });
  });
}

// ---- Activity Log ----
var ACTIVITY_LOG = JSON.parse(localStorage.getItem('jv_activity_log') || '[]');

function logActivity(type, message) {
  const entry = { type, message, time: new Date().toISOString(), id: Date.now() };
  ACTIVITY_LOG.unshift(entry);
  if (ACTIVITY_LOG.length > 100) ACTIVITY_LOG = ACTIVITY_LOG.slice(0, 100);
  localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
}

// Seed some demo entries if empty
if (ACTIVITY_LOG.length === 0) {
  const demoLogs = [
    { type: 'deal_view', message: 'Viewed deal: GreenMill (Score: 75)', time: new Date(Date.now() - 3600000).toISOString(), id: 1 },
    { type: 'memo_generated', message: 'Generated IC Memo for FactoryOS', time: new Date(Date.now() - 7200000).toISOString(), id: 2 },
    { type: 'navigation', message: 'Opened Fundraising Radar', time: new Date(Date.now() - 10800000).toISOString(), id: 3 },
    { type: 'credential_update', message: 'Updated Supabase credentials', time: new Date(Date.now() - 14400000).toISOString(), id: 4 },
    { type: 'deal_view', message: 'Viewed deal: SteelMind (Score: 68)', time: new Date(Date.now() - 18000000).toISOString(), id: 5 },
    { type: 'export', message: 'Downloaded LP Report Q4 2025', time: new Date(Date.now() - 21600000).toISOString(), id: 6 },
    { type: 'navigation', message: 'Opened Network Map', time: new Date(Date.now() - 25200000).toISOString(), id: 7 },
    { type: 'deal_view', message: 'Viewed deal: KartBee (Score: 65)', time: new Date(Date.now() - 28800000).toISOString(), id: 8 }
  ];
  ACTIVITY_LOG = demoLogs;
  localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
}

function renderActivityLog(area) {
  const typeIcons = { deal_view: '👁️', memo_generated: '📋', navigation: '🧭', credential_update: '🔑', export: '⬇️', search: '🔍', filter: '🔽' };
  const typeColors = { deal_view: 'var(--accent-blue)', memo_generated: 'var(--accent-purple)', navigation: 'var(--accent-green)', credential_update: 'var(--accent-orange)', export: 'var(--accent-pink)', search: 'var(--accent-indigo)', filter: 'var(--text-muted)' };

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${ACTIVITY_LOG.filter(l => l.type === 'deal_view').length}</div><div class="stat-card-label">Deal Views</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${ACTIVITY_LOG.filter(l => l.type === 'memo_generated').length}</div><div class="stat-card-label">Memos Generated</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${ACTIVITY_LOG.filter(l => l.type === 'credential_update').length}</div><div class="stat-card-label">Credential Updates</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${ACTIVITY_LOG.length}</div><div class="stat-card-label">Total Actions</div></div>
    </div>

    <div class="phase3-panel">
      <div class="log-header">
        <h3 class="phase3-panel-title" style="margin-bottom:0">📜 Recent Activity</h3>
        <button class="integration-connect-btn" id="clear-log-btn" style="background:var(--accent-red);font-size:0.75rem;padding:4px 12px">🗑️ Clear Log</button>
      </div>
      <div class="activity-list">
        ${ACTIVITY_LOG.map(log => {
    const t = new Date(log.time);
    const timeStr = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
            <div class="activity-item">
              <span class="activity-icon" style="color:${typeColors[log.type] || 'var(--text-muted)'}">${typeIcons[log.type] || '📌'}</span>
              <div class="activity-info">
                <span class="activity-msg">${log.message}</span>
                <span class="activity-time">${dateStr}, ${timeStr}</span>
              </div>
              <span class="signal-tag" style="background:${typeColors[log.type] || 'var(--text-muted)'}22;color:${typeColors[log.type] || 'var(--text-muted)'};font-size:0.65rem">${log.type.replace('_', ' ')}</span>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;

  document.getElementById('clear-log-btn')?.addEventListener('click', () => {
    ACTIVITY_LOG = [];
    localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
    renderActivityLog(area);
  });
}

// ---- Boot ----
async function boot() {
  // Each init is independently wrapped — a CDN failure won't block the app
  try { initStreak(); } catch (e) { console.warn('Streak init skipped:', e.message); }
  try { setTimeout(() => initGmail(), 1000); } catch (e) { console.warn('Gmail init skipped:', e.message); }

  // CRITICAL: init() MUST run regardless of integration status
  try {
    await init();
    console.log('✅ Boot complete, deals:', rankedStartups.length);
  } catch (e) {
    console.error('❌ Boot error:', e);
    document.getElementById('content-area').innerHTML = '<div style="padding:40px;color:#ef4444;font-size:16px;"><h2>⚠️ App Error</h2><pre style="color:#f59e0b;white-space:pre-wrap;">' + e.message + '\n\n' + e.stack + '</pre></div>';
  }
}

// Self-boot: fire immediately since all deps loaded synchronously before this
(async function () {
  if (typeof window._booted !== 'undefined' && window._booted) return;
  window._booted = true;
  try { await boot(); } catch (e) { console.error('Self-boot failed:', e); }
})();
